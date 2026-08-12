/**
 * Provider reviews: dispute/cancel comments must not appear as public reviews;
 * only rating 1–5 completion reviews count toward list + aggregate.
 * Run: node tests/providerReview.publicFilter.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const providerReviewService = require("../src/services/providerReview.service");
const { syncProviderAggregateRating } = require("../src/services/providerAggregateRating.service");
const jobDisputeService = require("../src/services/jobDispute.service");
const { mutateJobMeta } = require("../src/services/jobMeta.service");

async function cleanup(bundle) {
  if (!bundle) return;
  const { job, customer, providerUser, provider } = bundle;
  if (job?.id) {
    const dispute = await prisma.jobDispute.findUnique({ where: { jobId: job.id } }).catch(() => null);
    if (dispute) {
      await prisma.disputeEvidence.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.disputeMessage.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDisputeRound.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDispute.delete({ where: { id: dispute.id } }).catch(() => {});
    }
    await prisma.providerReview.deleteMany({ where: { jobId: job.id } }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: job.id } }).catch(() => {});
  }
  if (provider?.id) await prisma.provider.deleteMany({ where: { id: provider.id } }).catch(() => {});
  if (providerUser?.id) await prisma.user.deleteMany({ where: { id: providerUser.id } }).catch(() => {});
  if (customer?.id) await prisma.user.deleteMany({ where: { id: customer.id } }).catch(() => {});
}

async function seedAwaitingConfirmationJob() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `pubrev.cust.${suffix}@example.com`,
      password: "x",
      name: "PubRev Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `pubrev.prov.${suffix}@example.com`,
      password: "x",
      name: "PubRev Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `PubRev Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
      rating: 0,
      totalReviews: 0,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `PubRev job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Public review filter test",
      price: 1000,
      totalPrice: 1000,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "IN_PROGRESS",
      laborPaid: true,
      paymentModeSnapshot: "TWO_PAYMENT_50_50",
      paymentProgress: "FIRST_PAID",
      quotedAmount: 1000,
      firstPaymentAmount: 500,
      secondPaymentAmount: 500,
      meta: {},
    },
  });
  await mutateJobMeta(job.id, (m) => ({
    ...m,
    statusOverride: "AWAITING_CONFIRMATION",
    chat: [],
  }));
  return { customer, providerUser, provider, job };
}

async function main() {
  const bundle = await seedAwaitingConfirmationJob();
  try {
    await jobDisputeService.openDispute(bundle.job.id, bundle.customer.id, {
      comment: "Work incomplete — should not become a public review",
      requestedResolution: "REFUND",
      images: [],
      videos: [],
    });

    const disputeRow = await prisma.jobDispute.findUnique({ where: { jobId: bundle.job.id } });
    assert.ok(disputeRow, "dispute should be created");
    assert.ok(
      String(disputeRow.customerComment || "").includes("Work incomplete"),
      "comment should stay on dispute record"
    );

    const reviewAfterDispute = await prisma.providerReview.findUnique({
      where: { jobId: bundle.job.id },
    });
    assert.strictEqual(reviewAfterDispute, null, "dispute open must not create ProviderReview");

    // Seed legacy 0-star row + real review on same provider for list/aggregate checks.
    const suffix2 = `${Date.now()}-b`;
    const job2 = await prisma.job.create({
      data: {
        title: `Legacy zero ${suffix2}`,
        category: "plumbing",
        location: "Cape Town",
        description: "Legacy zero star",
        price: 500,
        totalPrice: 500,
        customerId: bundle.customer.id,
        providerId: bundle.providerUser.id,
        status: "IN_PROGRESS",
        laborPaid: true,
        paymentProgress: "FIRST_PAID",
        meta: {},
      },
    });
    const job3 = await prisma.job.create({
      data: {
        title: `Real review ${suffix2}`,
        category: "plumbing",
        location: "Cape Town",
        description: "Real review job",
        price: 500,
        totalPrice: 500,
        customerId: bundle.customer.id,
        providerId: bundle.providerUser.id,
        status: "COMPLETED",
        laborPaid: true,
        paymentProgress: "FULLY_PAID",
        meta: {},
      },
    });

    await prisma.providerReview.create({
      data: {
        id: randomUUID(),
        jobId: job2.id,
        customerId: bundle.customer.id,
        providerId: bundle.provider.id,
        rating: 0,
        comment: "Legacy dispute comment",
        wasDisputed: true,
      },
    });
    await prisma.providerReview.create({
      data: {
        id: randomUUID(),
        jobId: job3.id,
        customerId: bundle.customer.id,
        providerId: bundle.provider.id,
        rating: 5,
        comment: "Excellent work",
      },
    });

    await syncProviderAggregateRating(bundle.provider.id);
    const providerAfter = await prisma.provider.findUnique({ where: { id: bundle.provider.id } });
    assert.strictEqual(providerAfter.totalReviews, 1, "aggregate count excludes rating 0");
    assert.strictEqual(providerAfter.rating, 5, "aggregate average excludes rating 0");

    const listed = await providerReviewService.listProviderReviews(bundle.provider.id, { limit: 50 });
    assert.strictEqual(listed.total, 1, "list total excludes rating 0");
    assert.strictEqual(listed.reviews.length, 1);
    assert.strictEqual(listed.reviews[0].rating, 5);
    assert.strictEqual(listed.ratingBreakdown[0], 0, "breakdown excludes issue bar count");
    assert.strictEqual(listed.ratingBreakdown[5], 1);

    await prisma.providerReview.deleteMany({ where: { jobId: { in: [job2.id, job3.id] } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: { in: [job2.id, job3.id] } } }).catch(() => {});

    console.log("providerReview.publicFilter.test.js: OK");
  } finally {
    await cleanup(bundle);
  }
}

main()
  .catch((e) => {
    console.error("providerReview.publicFilter.test.js FAILED", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
