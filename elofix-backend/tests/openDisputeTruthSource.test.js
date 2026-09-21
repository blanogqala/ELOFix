/**
 * Open-case truth is persisted JobDispute status, not stale meta.statusOverride=DISPUTED.
 * Run: node tests/openDisputeTruthSource.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const prisma = require("../src/config/prisma");
const obligationService = require("../src/services/customerPaymentObligation.service");
const jobService = require("../src/services/job.service");

function skipIfNoDb() {
  if (!process.env.DATABASE_URL) {
    console.log("openDisputeTruthSource.test.js: skip (DATABASE_URL not set)");
    return true;
  }
  return false;
}

async function createBundle(statusOverride = "DISPUTED") {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `odts.cust.${suffix}@example.com`,
      password: "x",
      name: "Open Dispute Truth Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `odts.prov.${suffix}@example.com`,
      password: "x",
      name: "Open Dispute Truth Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `ODTS Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `ODTS job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Open dispute truth-source test",
      price: 1000,
      totalPrice: 1000,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "IN_PROGRESS",
      quotedAmount: 1000,
      firstPaymentAmount: 500,
      secondPaymentAmount: 500,
      paymentProgress: "FIRST_PAID",
      meta: {
        statusOverride: statusOverride,
        completionPaymentDue: null,
      },
    },
  });
  return { customer, providerUser, provider, job, suffix };
}

async function putDispute(bundle, status) {
  return prisma.jobDispute.create({
    data: {
      jobId: bundle.job.id,
      customerId: bundle.customer.id,
      providerId: bundle.providerUser.id,
      status,
      requestedResolution: "OTHER",
      customerComment: "open-dispute truth-source fixture",
    },
  });
}

async function cleanup(bundle) {
  if (!bundle) return;
  const jobId = bundle.job?.id;
  if (jobId) {
    await prisma.customerPaymentObligation.deleteMany({ where: { jobId } }).catch(() => {});
    const dispute = await prisma.jobDispute.findUnique({ where: { jobId } }).catch(() => null);
    if (dispute) {
      await prisma.disputeMessage.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.disputeResolutionLog.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDisputeRound.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDispute.delete({ where: { id: dispute.id } }).catch(() => {});
    }
    await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
  }
  if (bundle.provider?.id) await prisma.provider.delete({ where: { id: bundle.provider.id } }).catch(() => {});
  if (bundle.providerUser?.id) await prisma.user.delete({ where: { id: bundle.providerUser.id } }).catch(() => {});
  if (bundle.customer?.id) await prisma.user.delete({ where: { id: bundle.customer.id } }).catch(() => {});
}

async function testOpenDisputeWithDisputedMetaIsOpen() {
  const bundle = await createBundle("DISPUTED");
  try {
    await putDispute(bundle, "OPEN");
    const open = await obligationService.isJobUnderOpenCase(bundle.job.id);
    assert.strictEqual(open, true, "OPEN JobDispute + meta DISPUTED must be an open case");
  } finally {
    await cleanup(bundle);
  }
}

async function testUnderInvestigationIsOpen() {
  const bundle = await createBundle("DISPUTED");
  try {
    await putDispute(bundle, "UNDER_INVESTIGATION");
    const open = await obligationService.isJobUnderOpenCase(bundle.job.id);
    assert.strictEqual(open, true, "UNDER_INVESTIGATION JobDispute must be an open case");
  } finally {
    await cleanup(bundle);
  }
}

async function testResolvedWithStaleDisputedMetaIsNotOpen() {
  const bundle = await createBundle("DISPUTED");
  try {
    await putDispute(bundle, "RESOLVED");
    const open = await obligationService.isJobUnderOpenCase(bundle.job.id);
    assert.strictEqual(open, false, "RESOLVED JobDispute + stale DISPUTED override is not an open case");
  } finally {
    await cleanup(bundle);
  }
}

async function testClosedWithStaleDisputedMetaIsNotOpen() {
  const bundle = await createBundle("DISPUTED");
  try {
    await putDispute(bundle, "CLOSED");
    const open = await obligationService.isJobUnderOpenCase(bundle.job.id);
    assert.strictEqual(open, false, "CLOSED JobDispute + stale DISPUTED override is not an open case");
  } finally {
    await cleanup(bundle);
  }
}

async function testNoDisputeRowWithStaleDisputedMetaIsNotOpen() {
  const bundle = await createBundle("DISPUTED");
  try {
    const open = await obligationService.isJobUnderOpenCase(bundle.job.id);
    assert.strictEqual(open, false, "stale DISPUTED override without a JobDispute row is not an open case");
  } finally {
    await cleanup(bundle);
  }
}

async function testAdminReleaseSurvivesSubsequentJobRead() {
  const bundle = await createBundle("DISPUTED");
  try {
    await putDispute(bundle, "CLOSED");
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const obligation = await obligationService.upsertOpenObligation({
      customerId: bundle.customer.id,
      jobId: bundle.job.id,
      amount: 500,
      dueAt,
      source: "ADMIN_RELEASE",
    });
    assert.ok(obligation?.id);
    assert.strictEqual(obligation.status, "DUE");

    const dto = await jobService.getJobById(bundle.job.id);
    const after = await prisma.customerPaymentObligation.findUnique({ where: { id: obligation.id } });
    assert.strictEqual(after.status, "DUE", "ADMIN_RELEASE obligation must survive job read with stale DISPUTED override");
    assert.ok(dto.completionPaymentDue, "completionPaymentDue must remain visible after CLOSE_CASE + RELEASE_FUNDS");
    assert.strictEqual(dto.completionPaymentDue.obligationId, obligation.id);
    assert.strictEqual(String(dto.completionPaymentDue.source || ""), "ADMIN_RELEASE");
  } finally {
    await cleanup(bundle);
  }
}

async function testOpenDisputeCancelsDueAndOverdueObligations() {
  const dueBundle = await createBundle("DISPUTED");
  const overdueBundle = await createBundle("DISPUTED");
  try {
    const dueAtFuture = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const dueRow = await obligationService.upsertOpenObligation({
      customerId: dueBundle.customer.id,
      jobId: dueBundle.job.id,
      amount: 500,
      dueAt: dueAtFuture,
      source: "COMPLETION_WORKFLOW",
    });
    const overdueRow = await obligationService.upsertOpenObligation({
      customerId: overdueBundle.customer.id,
      jobId: overdueBundle.job.id,
      amount: 500,
      dueAt: new Date(Date.now() - 60 * 1000),
      source: "COMPLETION_WORKFLOW",
    });
    await prisma.customerPaymentObligation.update({
      where: { id: overdueRow.id },
      data: { status: "OVERDUE" },
    });

    await putDispute(dueBundle, "OPEN");
    await putDispute(overdueBundle, "OPEN");

    const dueDto = await jobService.getJobById(dueBundle.job.id);
    const overdueDto = await jobService.getJobById(overdueBundle.job.id);

    const dueAfter = await prisma.customerPaymentObligation.findUnique({ where: { id: dueRow.id } });
    const overdueAfter = await prisma.customerPaymentObligation.findUnique({ where: { id: overdueRow.id } });
    assert.strictEqual(dueAfter.status, "CANCELLED", "open dispute must cancel existing DUE obligation");
    assert.strictEqual(overdueAfter.status, "CANCELLED", "open dispute must cancel existing OVERDUE obligation");
    assert.strictEqual(dueDto.completionPaymentDue, null);
    assert.strictEqual(overdueDto.completionPaymentDue, null);
  } finally {
    await cleanup(dueBundle);
    await cleanup(overdueBundle);
  }
}

(async () => {
  if (skipIfNoDb()) return;
  await testOpenDisputeWithDisputedMetaIsOpen();
  await testUnderInvestigationIsOpen();
  await testResolvedWithStaleDisputedMetaIsNotOpen();
  await testClosedWithStaleDisputedMetaIsNotOpen();
  await testNoDisputeRowWithStaleDisputedMetaIsNotOpen();
  await testAdminReleaseSurvivesSubsequentJobRead();
  await testOpenDisputeCancelsDueAndOverdueObligations();
  console.log("openDisputeTruthSource.test.js passed");
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
