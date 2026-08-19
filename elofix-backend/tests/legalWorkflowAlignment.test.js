/**
 * Legal/workflow alignment — cancellation, payment due, legal status, overdue idempotency.
 * Run: node tests/legalWorkflowAlignment.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const { LEGAL_VERSIONS } = require("../src/config/legalVersions");
const { PAYMENT_DUE_DAYS, getPaymentDueMs } = require("../src/config/paymentDue.config");
const {
  computeLegalStatus,
  requiredVersionFieldsForRole,
} = require("../src/services/legalAcceptance.service");
const obligationService = require("../src/services/customerPaymentObligation.service");
const { resolveJobCancellationPolicy } = require("../src/utils/jobCancellationPolicy.util");
const prisma = require("../src/config/prisma");

async function testPaidServiceCancelOpensReviewNotR0() {
  const policy = await resolveJobCancellationPolicy(
    { id: "j-svc", customerId: "c1", providerId: "p1", laborPaid: true, status: "IN_PROGRESS" },
    {},
    "c1",
    "CUSTOMER"
  );
  assert.strictEqual(policy.opensDisputeReview, true);
  assert.strictEqual(policy.customerForfeits, false);
  assert.notStrictEqual(policy.refundKind, "forfeit_customer_en_route");
}

async function testCourierPostPickupBlocked() {
  const original = prisma.deliveryRequest.findFirst;
  prisma.deliveryRequest.findFirst = async () => ({
    fulfillmentStatus: "COLLECTED",
    status: "paid",
  });
  let threw = false;
  try {
    await resolveJobCancellationPolicy(
      {
        id: "j-c",
        customerId: "c1",
        providerId: "p1",
        laborPaid: true,
        status: "IN_PROGRESS",
      },
      { courierFlow: true },
      "c1",
      "CUSTOMER"
    );
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 409);
  } finally {
    prisma.deliveryRequest.findFirst = original;
  }
  assert.strictEqual(threw, true);
}

function testPaymentDueIs30Days() {
  assert.strictEqual(PAYMENT_DUE_DAYS, 30);
  if (!process.env.CUSTOMER_PAYMENT_DUE_MINUTES && !process.env.REFUND_DEBT_DUE_MINUTES) {
    assert.strictEqual(getPaymentDueMs(), 30 * 24 * 60 * 60 * 1000);
  }
}

function testLegalStatusRoleAware() {
  const customer = computeLegalStatus(
    { termsVersion: "old", privacyVersion: LEGAL_VERSIONS.privacy },
    "CUSTOMER"
  );
  assert.strictEqual(customer.current, false);
  assert.ok(customer.staleDocuments.includes("terms"));
  assert.ok(!customer.requiredDocuments.some((d) => d.key === "providerAgreement"));

  const providerCurrent = computeLegalStatus(
    {
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
      providerAgreementVersion: LEGAL_VERSIONS.providerAgreement,
      refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    },
    "PROVIDER"
  );
  assert.strictEqual(providerCurrent.current, true);
  assert.ok(requiredVersionFieldsForRole("PROVIDER").some((d) => d.key === "providerAgreement"));
}

function testDeriveDisplayStatus() {
  const now = new Date("2026-08-18T12:00:00.000Z");
  assert.strictEqual(
    obligationService.deriveDisplayStatus({ status: "DUE", dueAt: new Date("2026-09-17T12:00:00.000Z") }, now),
    "DUE"
  );
  assert.strictEqual(
    obligationService.deriveDisplayStatus({ status: "DUE", dueAt: new Date("2026-08-01T12:00:00.000Z") }, now),
    "OVERDUE"
  );
  assert.strictEqual(
    obligationService.deriveDisplayStatus({ status: "PAID", dueAt: new Date("2026-08-01T12:00:00.000Z") }, now),
    "PAID"
  );
}

function testLegalVersionsBumped() {
  assert.strictEqual(LEGAL_VERSIONS.terms, process.env.LEGAL_TERMS_VERSION || "2026-08-18-r2");
  assert.strictEqual(LEGAL_VERSIONS.refundPolicy, process.env.LEGAL_REFUND_POLICY_VERSION || "2026-08-18-r2");
  assert.strictEqual(LEGAL_VERSIONS.privacy, process.env.LEGAL_PRIVACY_VERSION || "2026-08-18");
}

async function runDbTestsIfPossible() {
  const url = process.env.DATABASE_URL || "";
  if (!url || url.includes("placeholder")) {
    console.log("legalWorkflowAlignment: skipped DB integration (no DATABASE_URL)");
    return;
  }
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let customer;
  let job;
  try {
    customer = await prisma.user.create({
      data: {
        email: `obl-c-${suffix}@example.com`,
        password: "hash",
        name: "Obligation Customer",
        role: "CUSTOMER",
        termsVersion: LEGAL_VERSIONS.terms,
        privacyVersion: LEGAL_VERSIONS.privacy,
        acceptedTerms: true,
        acceptedPrivacy: true,
      },
    });
    job = await prisma.job.create({
      data: {
        title: "Obligation job",
        description: "Test obligation lifecycle",
        price: 1000,
        customerId: customer.id,
        paymentModeSnapshot: "TWO_PAYMENT_50_50",
        quotedAmount: 1000,
        firstPaymentAmount: 500,
        secondPaymentAmount: 500,
        paymentProgress: "FIRST_PAID",
        laborPaid: true,
        status: "IN_PROGRESS",
      },
    });
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await obligationService.upsertOpenObligation({
      customerId: customer.id,
      jobId: job.id,
      amount: 500,
      dueAt,
      source: "ADMIN_RELEASE",
    });
    assert.ok(created);
    assert.strictEqual(String(created.status), "DUE");
    await obligationService.assertCustomerCanStartPaidTransaction(customer.id);

    const overdueRow = await prisma.customerPaymentObligation.update({
      where: { id: created.id },
      data: { dueAt: new Date(Date.now() - 60 * 1000), status: "DUE" },
    });
    const { processCustomerPaymentObligations } = require("../src/jobs/customerPaymentObligation.job");
    const first = await processCustomerPaymentObligations();
    const second = await processCustomerPaymentObligations();
    const after = await prisma.customerPaymentObligation.findUnique({ where: { id: overdueRow.id } });
    assert.strictEqual(after.status, "OVERDUE");
    const userAfter = await prisma.user.findUnique({ where: { id: customer.id } });
    assert.strictEqual(userAfter.marketplaceRestricted, true);
    assert.ok(first.overdue >= 1);
    assert.strictEqual(second.overdue, 0);

    await obligationService.markObligationPaidForJob(job.id);
    await obligationService.afterObligationPaid(customer.id);
    const userCleared = await prisma.user.findUnique({ where: { id: customer.id } });
    assert.strictEqual(userCleared.marketplaceRestricted, false);
  } finally {
    if (job?.id) await prisma.customerPaymentObligation.deleteMany({ where: { jobId: job.id } });
    if (job?.id) await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    if (customer?.id) await prisma.user.delete({ where: { id: customer.id } }).catch(() => {});
  }
}

(async () => {
  await testPaidServiceCancelOpensReviewNotR0();
  await testCourierPostPickupBlocked();
  testPaymentDueIs30Days();
  testLegalStatusRoleAware();
  testDeriveDisplayStatus();
  testLegalVersionsBumped();
  await runDbTestsIfPossible();
  console.log("legalWorkflowAlignment.test.js passed");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
