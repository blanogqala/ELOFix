/**
 * Idempotent CI/E2E seed: dedicated customer + provider + jobs for
 * frontend/e2e/realtime-cross-user.spec.ts.
 *
 * Credentials exist only in the disposable CI/test database.
 * Prints KEY=value lines suitable for GitHub Actions $GITHUB_ENV.
 *
 * Run: node scripts/seed-e2e-ci.js
 */
require("dotenv").config({ quiet: true });
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { LEGAL_VERSIONS } = require("../src/config/legalVersions");
const paymentModeService = require("../src/services/payments/paymentMode.service");

const CUSTOMER_EMAIL = "e2e.ci.customer@elofix.test";
const CUSTOMER_PASSWORD = "E2eCiCust#Pass1";
const PROVIDER_EMAIL = "e2e.ci.provider@elofix.test";
const PROVIDER_PASSWORD = "E2eCiProv#Pass1";
const REALTIME_JOB_ID = "c1e2e001-0000-4000-8000-000000000001";
const DISPUTE_JOB_ID = "c1e2e001-0000-4000-8000-000000000002";

if (!process.env.DATABASE_URL) {
  console.error("seed-e2e-ci: DATABASE_URL is required");
  process.exit(1);
}

const prisma = require("../src/config/prisma");

function emitEnv() {
  const lines = [
    `E2E_CUSTOMER_EMAIL=${CUSTOMER_EMAIL}`,
    `E2E_CUSTOMER_PASSWORD=${CUSTOMER_PASSWORD}`,
    `E2E_PROVIDER_EMAIL=${PROVIDER_EMAIL}`,
    `E2E_PROVIDER_PASSWORD=${PROVIDER_PASSWORD}`,
    `E2E_REALTIME_JOB_ID=${REALTIME_JOB_ID}`,
    `E2E_DISPUTE_JOB_ID=${DISPUTE_JOB_ID}`,
  ];
  const body = `${lines.join("\n")}\n`;
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, body);
  } else {
    process.stdout.write(body);
  }
  process.stderr.write("seed-e2e-ci: E2E users and jobs are ready\n");
}

async function legalFields(role) {
  const now = new Date();
  const base = {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedRefundPolicy: true,
    acceptedAt: now,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
  };
  if (role === "PROVIDER") {
    return {
      ...base,
      acceptedProviderAgreement: true,
      providerAgreementVersion: LEGAL_VERSIONS.providerAgreement,
    };
  }
  return base;
}

async function clearJobSideEffects(jobId) {
  const dispute = await prisma.jobDispute.findUnique({ where: { jobId } }).catch(() => null);
  if (dispute) {
    await prisma.disputeMessage.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
    await prisma.disputeResolutionLog.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
    await prisma.jobDisputeRound.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
    await prisma.disputeEvidence.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
    await prisma.refundRecovery.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
    await prisma.jobDispute.delete({ where: { id: dispute.id } }).catch(() => {});
  }
  await prisma.jobCompletionEvidence.deleteMany({ where: { jobId } }).catch(() => {});
  await prisma.providerReview.deleteMany({ where: { jobId } }).catch(() => {});
}

async function upsertUser({ email, password, name, role }) {
  const hashed = await bcrypt.hash(password, 12);
  const legal = await legalFields(role);
  return prisma.user.upsert({
    where: { email },
    update: {
      password: hashed,
      name,
      role,
      blocked: false,
      deletedAt: null,
      marketplaceRestricted: false,
      ...legal,
    },
    create: {
      email,
      password: hashed,
      name,
      role,
      ...legal,
    },
  });
}

async function upsertJob({
  id,
  title,
  customerId,
  providerId,
  schedule,
  meta,
  paymentProgress,
}) {
  await clearJobSideEffects(id);
  const quoted = Number(schedule.quotedAmount);
  const data = {
    title,
    category: "plumbing",
    location: "Cape Town",
    description: "Deterministic CI realtime job. Kitchen tap leak for E2E coverage.",
    price: quoted,
    totalPrice: quoted,
    customerId,
    providerId,
    status: "IN_PROGRESS",
    laborPaid: true,
    paymentReleased: false,
    legacyEscrowV2: false,
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    quotedAmount: schedule.quotedAmount,
    firstPaymentAmount: schedule.firstPaymentAmount,
    secondPaymentAmount: schedule.secondPaymentAmount,
    paymentProgress,
    commissionAmount: 0,
    releasedAmount: 0,
    isFullyReleased: false,
    escrowSecondReleaseDone: false,
    meta,
  };
  return prisma.job.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
}

async function main() {
  const customer = await upsertUser({
    email: CUSTOMER_EMAIL,
    password: CUSTOMER_PASSWORD,
    name: "E2E Ci Customer",
    role: "CUSTOMER",
  });
  const providerUser = await upsertUser({
    email: PROVIDER_EMAIL,
    password: PROVIDER_PASSWORD,
    name: "E2E Ci Provider",
    role: "PROVIDER",
  });

  await prisma.provider.upsert({
    where: { userId: providerUser.id },
    update: {
      skills: ["plumbing"],
      location: "Cape Town",
      bio: "Approved CI plumbing provider for deterministic Playwright realtime tests.",
      approved: true,
      profileCompleted: true,
      blocked: false,
      businessName: "E2E Ci Plumbing",
      serviceAreas: ["Cape Town"],
      deletedAt: null,
      rejectionReason: null,
      rejectedAt: null,
      fraudReviewStatus: "NONE",
    },
    create: {
      userId: providerUser.id,
      skills: ["plumbing"],
      location: "Cape Town",
      bio: "Approved CI plumbing provider for deterministic Playwright realtime tests.",
      approved: true,
      profileCompleted: true,
      businessName: "E2E Ci Plumbing",
      serviceAreas: ["Cape Town"],
    },
  });

  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", 1000);
  const now = new Date();
  const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const servicePrice = { amount: 1000, submittedAt: now.toISOString() };

  await upsertJob({
    id: REALTIME_JOB_ID,
    title: "CI realtime mark-complete job",
    customerId: customer.id,
    providerId: providerUser.id,
    schedule,
    paymentProgress: "FULLY_PAID",
    meta: {
      servicePrice,
      laborPaid: true,
    },
  });

  await upsertJob({
    id: DISPUTE_JOB_ID,
    title: "CI realtime dispute job",
    customerId: customer.id,
    providerId: providerUser.id,
    schedule,
    paymentProgress: "FIRST_PAID",
    meta: {
      servicePrice,
      laborPaid: true,
      statusOverride: "AWAITING_CONFIRMATION",
      markedCompleteAt: now.toISOString(),
      confirmationDeadlineAt: deadline.toISOString(),
    },
  });

  emitEnv();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
