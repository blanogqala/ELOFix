const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { logAudit } = require("../services/auditLog.service");

const TEN_MIN_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000;

async function failStalePendingWithdrawals() {
  let stale;
  try {
    try {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);
      stale = await prisma.withdrawalRequest.findMany({
        where: {
          status: { in: ["pending", "PENDING"] },
          createdAt: { lt: cutoff },
        },
      });
    } catch (e) {
      if (e?.code === "P2021" || e?.code === "P2022") {
        console.warn("[stuckWithdrawalRecovery] skipping tick: withdrawal schema not ready", e.code);
        return;
      }
      console.warn(
        "[stuckWithdrawalRecovery] DB unavailable or query failed; will retry next cycle",
        e?.message || e
      );
      return;
    }

    for (const wr of stale) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const row = await tx.withdrawalRequest.findUnique({ where: { id: wr.id } });
            const st = String(row.status || "").toLowerCase();
            if (!row || st !== "pending") return;

            const earning = await tx.earning.findFirst({
              where: { withdrawalRequestId: row.id },
            });

            if (earning && earning.status === "pending") {
              await tx.earning.update({
                where: { id: earning.id },
                data: { status: "cancelled" },
              });
            }

            await tx.withdrawalRequest.update({
              where: { id: row.id },
              data: { status: "failed" },
            });
          },
          {
            maxWait: 5000,
            timeout: 15000,
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        );

        await logAudit("withdrawal.auto_failed_stale", {
          userId: null,
          metadata: {
            withdrawalId: wr.id,
            providerId: wr.providerId,
            amount: Number(wr.amount),
          },
        });
      } catch (e) {
        console.error("[stuckWithdrawalRecovery] failed for", wr.id, e);
      }
    }
  } catch (e) {
    console.warn("[stuckWithdrawalRecovery] tick aborted (non-fatal)", e?.message || e);
  }
}

function startStuckWithdrawalRecovery() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DISABLE_STUCK_WITHDRAWAL_CRON === "true"
  ) {
    console.log("[stuckWithdrawalRecovery] cron disabled (development + DISABLE_STUCK_WITHDRAWAL_CRON)");
    return () => {};
  }
  const tick = () => {
    failStalePendingWithdrawals().catch((err) => {
      console.error("[stuckWithdrawalRecovery] tick error", err);
    });
  };
  const id = setInterval(tick, TEN_MIN_MS);
  if (typeof id.unref === "function") id.unref();
  return () => clearInterval(id);
}

module.exports = { startStuckWithdrawalRecovery, failStalePendingWithdrawals };
