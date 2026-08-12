/**
 * Standalone provider review create — ownership, COMPLETED, fully-paid, duplicate, media.
 * Run: node tests/providerReview.create.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const providerReviewService = require("../src/services/providerReview.service");

async function cleanup(bundle) {
  if (!bundle) return;
  const { job, customer, providerUser, provider } = bundle;
  if (job?.id) {
    await prisma.providerReview.deleteMany({ where: { jobId: job.id } }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: job.id } }).catch(() => {});
  }
  if (provider?.id) await prisma.provider.deleteMany({ where: { id: provider.id } }).catch(() => {});
  if (providerUser?.id) await prisma.user.deleteMany({ where: { id: providerUser.id } }).catch(() => {});
  if (customer?.id) await prisma.user.deleteMany({ where: { id: customer.id } }).catch(() => {});
}

async function seedCompletedJob({ fullyPaid = true } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `rev.cust.${suffix}@example.com`,
      password: "x",
      name: "Review Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `rev.prov.${suffix}@example.com`,
      password: "x",
      name: "Review Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Rev Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `Review job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Standalone review test job",
      price: 1000,
      totalPrice: 1000,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "COMPLETED",
      laborPaid: true,
      paymentModeSnapshot: "TWO_PAYMENT_50_50",
      paymentProgress: fullyPaid ? "FULLY_PAID" : "FIRST_PAID",
      quotedAmount: 1000,
      firstPaymentAmount: 500,
      secondPaymentAmount: 500,
      providerAmount: 930,
      commissionAmount: 70,
      meta: {},
    },
  });
  return { customer, providerUser, provider, job };
}

async function main() {
  const ids = await seedCompletedJob({ fullyPaid: true });
  try {
    let threw = false;
    try {
      await providerReviewService.createProviderReview({
        jobId: ids.job.id,
        customerUserId: ids.customer.id,
        rating: 0,
        comment: "bad",
      });
    } catch (e) {
      threw = true;
      assert.ok(/rating/i.test(e.message));
    }
    assert.ok(threw, "expected invalid rating to throw");

    threw = false;
    try {
      await providerReviewService.createProviderReview({
        jobId: ids.job.id,
        customerUserId: randomUUID(),
        rating: 5,
        comment: "nope",
      });
    } catch (e) {
      threw = true;
      assert.ok(e.statusCode === 403 || /Forbidden/i.test(e.message));
    }
    assert.ok(threw, "expected forbidden");

    const partial = await seedCompletedJob({ fullyPaid: false });
    try {
      threw = false;
      try {
        await providerReviewService.createProviderReview({
          jobId: partial.job.id,
          customerUserId: partial.customer.id,
          rating: 4,
          comment: "early",
        });
      } catch (e) {
        threw = true;
        assert.ok(/fully paid/i.test(e.message));
      }
      assert.ok(threw, "expected fully-paid gate");
    } finally {
      await cleanup(partial);
    }

    const review = await providerReviewService.createProviderReview({
      jobId: ids.job.id,
      customerUserId: ids.customer.id,
      rating: 5,
      comment: "Great work",
      images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
      videos: [],
    });
    assert.strictEqual(review.rating, 5);
    assert.strictEqual(review.comment, "Great work");
    assert.ok(Array.isArray(review.images) && review.images.length === 2);

    const row = await prisma.providerReview.findUnique({ where: { jobId: ids.job.id } });
    assert.ok(row);
    assert.strictEqual(row.images.length, 2);

    threw = false;
    try {
      await providerReviewService.createProviderReview({
        jobId: ids.job.id,
        customerUserId: ids.customer.id,
        rating: 4,
        comment: "again",
      });
    } catch (e) {
      threw = true;
      assert.ok(e.statusCode === 409 || /already/i.test(e.message));
    }
    assert.ok(threw, "expected duplicate 409");

    console.log("providerReview.create.test.js: OK");
  } finally {
    await cleanup(ids);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
