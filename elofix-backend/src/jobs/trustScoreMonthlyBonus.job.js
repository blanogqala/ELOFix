const prisma = require("../config/prisma");
const providerTrustScore = require("../services/providerTrustScore.service");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function processMonthlyTrustBonus() {
  const since = new Date(Date.now() - 30 * ONE_DAY_MS);
  let providers;
  try {
    providers = await prisma.provider.findMany({
      where: { approved: true, deletedAt: null },
      select: { id: true, userId: true },
      take: 500,
    });
  } catch (e) {
    console.warn("[trustScoreMonthlyBonus] query failed", e?.message || e);
    return;
  }

  for (const p of providers) {
    try {
      const [disputes, refunds] = await Promise.all([
        prisma.jobDispute.count({
          where: { providerId: p.userId, openedAt: { gte: since } },
        }),
        prisma.fraudAlert.count({
          where: {
            providerId: p.id,
            alertType: { in: ["DUPLICATE_SA_ID", "DUPLICATE_COMPANY_REG", "DUPLICATE_BANK_ACCOUNT", "FAKE_DOCUMENTATION"] },
            createdAt: { gte: since },
          },
        }),
      ]);
      if (disputes === 0 && refunds === 0) {
        await providerTrustScore.onMonthWithoutComplaints(p.id);
      }
    } catch (e) {
      console.error("[trustScoreMonthlyBonus] failed for provider", p.id, e?.message || e);
    }
  }
}

function startTrustScoreMonthlyBonusJob() {
  if (process.env.DISABLE_TRUST_MONTHLY_CRON === "true") {
    console.log("[trustScoreMonthlyBonus] cron disabled");
    return () => {};
  }
  const tick = () => {
    processMonthlyTrustBonus().catch((err) => {
      console.error("[trustScoreMonthlyBonus] tick error", err);
    });
  };
  const id = setInterval(tick, ONE_DAY_MS);
  if (typeof id.unref === "function") id.unref();
  return () => clearInterval(id);
}

module.exports = { startTrustScoreMonthlyBonusJob, processMonthlyTrustBonus };
