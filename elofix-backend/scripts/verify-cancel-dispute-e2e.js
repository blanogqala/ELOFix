/**
 * E2E verify: paid job cancel opens dispute (no auto-refund).
 * Run: node scripts/verify-cancel-dispute-e2e.js
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const jobService = require("../src/services/job.service");
const { getJobMeta, toFrontendStatus } = require("../src/services/jobMeta.service");

async function findCancellablePaidJob() {
  const jobs = await prisma.job.findMany({
    where: {
      laborPaid: true,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      providerId: { not: null },
    },
    select: {
      id: true,
      title: true,
      status: true,
      laborPaid: true,
      customerId: true,
      providerId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  for (const job of jobs) {
    const meta = await getJobMeta(job.id);
    const frontendStatus = meta?.statusOverride || job.status;
    if (String(frontendStatus).toUpperCase() === "DISPUTED") continue;
    const existing = await prisma.jobDispute.findFirst({
      where: { jobId: job.id, status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
    });
    if (existing) continue;
    return { job, meta, ephemeral: false };
  }
  return null;
}

async function createTempPaidJob() {
  const seed = await prisma.job.findFirst({
    where: { providerId: { not: null } },
    select: { customerId: true, providerId: true, category: true, location: true },
    orderBy: { createdAt: "desc" },
  });
  if (!seed?.customerId || !seed?.providerId) {
    throw new Error("No seed job with customer and provider — cannot create temp paid job");
  }

  const jobId = randomUUID();
  const totalPrice = 3000;
  const providerAmount = 2790;
  const commissionAmount = 210;

  const job = await prisma.job.create({
    data: {
      id: jobId,
      title: "E2E cancel-dispute verify",
      category: seed.category || "GENERAL",
      location: seed.location || "UNKNOWN",
      description: "Temporary job for cancel-dispute e2e verification",
      status: "ACCEPTED",
      price: totalPrice,
      customerId: seed.customerId,
      providerId: seed.providerId,
      laborPaid: true,
      totalPrice,
      providerAmount,
      commissionAmount,
      releasedAmount: providerAmount / 2,
      meta: {
        laborPaid: true,
        servicePayment: { status: "paid", amount: totalPrice },
        statusOverride: "ACCEPTED",
      },
    },
    select: {
      id: true,
      title: true,
      status: true,
      laborPaid: true,
      customerId: true,
      providerId: true,
    },
  });

  return { job, meta: await getJobMeta(job.id), ephemeral: true };
}

async function cleanupEphemeralJob(jobId, disputeId) {
  if (disputeId) {
    await prisma.disputeMessage.deleteMany({ where: { disputeId } });
    await prisma.jobDisputeRound.deleteMany({ where: { disputeId } });
    await prisma.disputeResolutionLog.deleteMany({ where: { disputeId } });
    await prisma.jobDispute.deleteMany({ where: { id: disputeId } });
  }
  await prisma.job.deleteMany({ where: { id: jobId } });
}

async function run() {
  let found = await findCancellablePaidJob();
  if (!found) {
    console.log("No live cancellable paid job — creating temporary test job...");
    found = await createTempPaidJob();
  }

  const { job, ephemeral } = found;
  console.log(`Testing cancel on job ${job.id} (${job.title}) status=${job.status}`);

  const result = await jobService.cancelJob(
    job.id,
    "E2E verify cancel dispute",
    "Automated verification script",
    job.customerId,
    "CUSTOMER"
  );

  const updated = await prisma.job.findUnique({ where: { id: job.id } });
  const metaAfter = await getJobMeta(job.id);
  const frontendStatus = String(toFrontendStatus(updated?.status, metaAfter) || "").toUpperCase();
  const dispute = result.disputeId
    ? await prisma.jobDispute.findUnique({ where: { id: result.disputeId } })
    : null;

  const checks = [
    ["disputeOpened", result.disputeOpened === true, result.disputeOpened],
    ["refundAmount zero", result.refundAmount === 0, result.refundAmount],
    ["disputeId present", Boolean(result.disputeId), result.disputeId],
    ["job status DISPUTED", frontendStatus === "DISPUTED", frontendStatus],
    ["dispute record exists", Boolean(dispute), dispute?.id],
    ["dispute status open", dispute && ["OPEN", "UNDER_INVESTIGATION"].includes(dispute.status), dispute?.status],
  ];

  let failed = false;
  for (const [label, ok, value] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}${value != null ? ` (${value})` : ""}`);
    if (!ok) failed = true;
  }

  if (ephemeral) {
    await cleanupEphemeralJob(job.id, result.disputeId);
    console.log("Cleaned up temporary test job");
  }

  if (failed) {
    console.error("E2E verification FAILED");
    process.exit(1);
  }
  console.log("E2E verification PASSED: paid cancel opened dispute, no auto-refund");
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
