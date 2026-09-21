/**
 * Disposable-database self-test for reset-test-transactions.js.
 *
 * Creates elofix_reset_tx_test, applies the current Prisma schema, seeds
 * accounts + transactional rows, then runs dry-run and confirmed reset
 * against THAT database only.
 *
 * Never issues --confirm against the caller's current DATABASE_URL database.
 *
 * Run: node scripts/reset-test-transactions.selftest.js
 */
require("dotenv").config();

const assert = require("assert");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const { spawnSync } = require("child_process");
const path = require("path");
const { Client } = require("pg");
const { parseArgs, CONFIRM_TOKEN, REFUND_DEBT_BLOCK_REASON } = require("./reset-test-transactions");

const DISPOSABLE_DB = "elofix_reset_tx_test";
const PASSWORD = "ResetTx#Pass1";

function asHttpUrl(databaseUrl) {
  return new URL(String(databaseUrl).replace(/^postgres(ql)?:/i, "http:"));
}

function toPostgresUrl(httpUrl) {
  return httpUrl.toString().replace(/^http:/i, "postgresql:");
}

function sourceDatabaseName(databaseUrl) {
  return decodeURIComponent((asHttpUrl(databaseUrl).pathname || "").replace(/^\//, "").split("/")[0] || "");
}

function assertParseArgs() {
  const dryDefault = parseArgs(["node", "script.js"]);
  assert.strictEqual(dryDefault.ok, true);
  assert.strictEqual(dryDefault.dryRun, true);

  const dryFlag = parseArgs(["node", "script.js", "--dry-run"]);
  assert.strictEqual(dryFlag.ok, true);
  assert.strictEqual(dryFlag.dryRun, true);

  const badToken = parseArgs(["node", "script.js", "--confirm=nope"]);
  assert.strictEqual(badToken.ok, false);
  assert.strictEqual(badToken.dryRun, true);

  const bare = parseArgs(["node", "script.js", "--confirm", CONFIRM_TOKEN]);
  assert.strictEqual(bare.ok, false);

  const both = parseArgs(["node", "script.js", "--dry-run", `--confirm=${CONFIRM_TOKEN}`]);
  assert.strictEqual(both.ok, false);

  const ok = parseArgs(["node", "script.js", `--confirm=${CONFIRM_TOKEN}`]);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.dryRun, false);
}

async function recreateDisposableDatabase(sourceUrl) {
  const srcName = sourceDatabaseName(sourceUrl);
  if (!srcName || srcName === DISPOSABLE_DB) {
    throw new Error(
      `Refusing to create disposable DB: source database is "${srcName}". Set DATABASE_URL to a different local database.`
    );
  }
  const adminUrl = asHttpUrl(sourceUrl);
  adminUrl.pathname = "/postgres";
  const disposableUrl = asHttpUrl(sourceUrl);
  disposableUrl.pathname = `/${DISPOSABLE_DB}`;

  const admin = new Client({ connectionString: toPostgresUrl(adminUrl) });
  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DISPOSABLE_DB]);
    if (found.rowCount) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [DISPOSABLE_DB]
      );
      await admin.query(`DROP DATABASE IF EXISTS ${DISPOSABLE_DB}`);
    }
    await admin.query(`CREATE DATABASE ${DISPOSABLE_DB}`);
  } finally {
    await admin.end();
  }
  return toPostgresUrl(disposableUrl);
}

async function dropDisposableDatabase(sourceUrl) {
  const adminUrl = asHttpUrl(sourceUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: toPostgresUrl(adminUrl) });
  await admin.connect();
  try {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [DISPOSABLE_DB]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${DISPOSABLE_DB}`);
  } finally {
    await admin.end();
  }
}

function pushSchema(disposableUrl) {
  const result = spawnSync("npx", ["prisma", "db", "push"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: disposableUrl,
      NODE_ENV: "test",
    },
  });
  if (result.status !== 0) {
    throw new Error(`prisma db push failed on disposable database (exit ${result.status})`);
  }
}

async function seedFixtures(prisma) {
  const suffix = randomUUID().slice(0, 8);
  const hashed = await bcrypt.hash(PASSWORD, 12);
  const inventoryProducts = [
    { id: "prod-pipe", name: "PVC Pipe", price: 49.99, stock: 12 },
    { id: "prod-elbow", name: "Elbow Joint", price: 9.5, stock: 40 },
  ];

  await prisma.category.upsert({
    where: { id: "plumbing" },
    update: { name: "Plumbing", icon: "🔧", description: "Selftest plumbing", step3Type: "issue" },
    create: {
      id: "plumbing",
      name: "Plumbing",
      icon: "🔧",
      description: "Selftest plumbing",
      skills: ["plumbing"],
      step3Type: "issue",
      issueTypes: ["Leak"],
    },
  });

  const customer = await prisma.user.create({
    data: {
      email: `reset.tx.cust.${suffix}@example.com`,
      password: hashed,
      name: "Reset Tx Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `reset.tx.prov.${suffix}@example.com`,
      password: hashed,
      name: "Reset Tx Provider",
      role: "PROVIDER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `reset.tx.sup.${suffix}@example.com`,
      password: hashed,
      name: "Reset Tx Supplier",
      role: "SUPPLIER",
    },
  });

  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      skills: ["plumbing", "pipe-repair"],
      location: "Cape Town",
      bio: "Keep this bio",
      approved: true,
      profileCompleted: true,
      businessName: "Reset Tx Plumbing",
      serviceAreas: ["Cape Town"],
      laborPricing: { hourly: 350 },
      documents: { idDoc: { url: "/api/files/id-doc", status: "approved" } },
      settings: { notifySms: true },
      rating: 4.5,
      totalReviews: 1,
    },
  });

  await prisma.providerTrustScore.create({
    data: {
      providerId: provider.id,
      score: 74,
      disputeCount: 1,
      refundCount: 1,
      completedJobs: 1,
      positiveReviews: 1,
      history: [
        { reason: "verified_id", delta: 10, at: "2026-01-01T00:00:00.000Z" },
        { reason: "verified_company", delta: 10, at: "2026-01-02T00:00:00.000Z" },
        { reason: "verified_bank", delta: 10, at: "2026-01-03T00:00:00.000Z" },
        { reason: "job_completed", delta: 2, at: "2026-02-01T00:00:00.000Z" },
        { reason: "positive_review", delta: 2, at: "2026-02-02T00:00:00.000Z" },
        { reason: "five_star_review", delta: 3, at: "2026-02-03T00:00:00.000Z" },
        { reason: "dispute_lost", delta: -15, at: "2026-03-01T00:00:00.000Z" },
        { reason: "refund_request", delta: -10, at: "2026-03-02T00:00:00.000Z" },
        { reason: "partial_refund", delta: -10, at: "2026-03-03T00:00:00.000Z" },
        { reason: "full_refund", delta: -25, at: "2026-03-04T00:00:00.000Z" },
      ],
    },
  });

  const providerBank = await prisma.providerWithdrawalProfile.create({
    data: {
      providerId: provider.id,
      bankName: "FNB",
      accountNumber: "1234567890",
      accountHolder: "Reset Tx Provider",
      branchCode: "250655",
      accountType: "CHEQUE",
      verificationStatus: "VERIFIED",
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: "ACCT_selftest_provider",
      isActive: true,
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      userId: supplierUser.id,
      name: "Reset Tx Supplies",
      businessName: "Reset Tx Supplies",
      products: inventoryProducts,
    },
  });
  const branch = await prisma.branch.create({
    data: {
      supplierId: supplier.id,
      name: "Reset Tx Branch",
      city: "Cape Town",
      products: inventoryProducts,
      isActive: true,
    },
  });
  const inventoryCategory = await prisma.branchInventoryCategory.create({
    data: { branchId: branch.id, name: "pipes" },
  });
  const branchBank = await prisma.branchWithdrawalProfile.create({
    data: {
      branchId: branch.id,
      bankName: "Standard Bank",
      accountNumber: "9876543210",
      accountHolder: "Reset Tx Branch",
      branchCode: "051001",
      accountType: "CURRENT",
      verificationStatus: "VERIFIED",
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: "ACCT_selftest_branch",
      isActive: true,
    },
  });
  const branchUser = await prisma.branchUser.create({
    data: {
      branchId: branch.id,
      email: `reset.tx.staff.${suffix}@example.com`,
      password: hashed,
      role: "MANAGER",
    },
  });

  const debtProviderUser = await prisma.user.create({
    data: {
      email: `reset.tx.debt.${suffix}@example.com`,
      password: hashed,
      name: "Reset Tx Debt Provider",
      role: "PROVIDER",
    },
  });
  const debtProvider = await prisma.provider.create({
    data: {
      userId: debtProviderUser.id,
      skills: ["plumbing"],
      location: "Cape Town",
      approved: true,
      profileCompleted: true,
      businessName: "Reset Tx Debt Plumbing",
      blocked: true,
      blockedReason: REFUND_DEBT_BLOCK_REASON,
      blockedAt: new Date("2026-03-01T00:00:00.000Z"),
      refundDebtBlockedAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  });
  const debtJob = await prisma.job.create({
    data: {
      title: "Reset Tx Debt Job",
      category: "plumbing",
      location: "Cape Town",
      description: "Job that created refund-debt block",
      status: "CANCELLED",
      price: 200,
      customerId: customer.id,
      providerId: debtProviderUser.id,
    },
  });
  await prisma.refundRecovery.create({
    data: {
      providerId: debtProvider.id,
      customerId: customer.id,
      jobId: debtJob.id,
      totalPending: 80,
      status: "OVERDUE",
      dueAt: new Date("2026-03-01T00:00:00.000Z"),
      reference: `RR-DEBT-${suffix}`,
    },
  });

  const fraudProviderUser = await prisma.user.create({
    data: {
      email: `reset.tx.fraud.${suffix}@example.com`,
      password: hashed,
      name: "Reset Tx Fraud Provider",
      role: "PROVIDER",
    },
  });
  const fraudProvider = await prisma.provider.create({
    data: {
      userId: fraudProviderUser.id,
      skills: ["plumbing"],
      location: "Cape Town",
      approved: false,
      profileCompleted: true,
      businessName: "Reset Tx Fraud Plumbing",
      blocked: true,
      blockedReason: "Admin fraud review — fake documentation",
      blockedAt: new Date("2026-04-01T00:00:00.000Z"),
      refundDebtBlockedAt: null,
    },
  });

  const job = await prisma.job.create({
    data: {
      title: "Reset Tx Job",
      category: "plumbing",
      location: "Cape Town",
      description: "Transactional reset fixture job",
      status: "COMPLETED",
      price: 1000,
      customerId: customer.id,
      providerId: providerUser.id,
      laborPaid: true,
      paymentProgress: "FULLY_PAID",
    },
  });

  const order = await prisma.materialOrder.create({
    data: {
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branch.id,
      jobId: job.id,
      providerId: providerUser.id,
      paymentStatus: "paid",
      source: "job_materials",
      fulfillmentStatus: "COMPLETED",
      materialsSubtotal: 100,
      platformCommission: 7,
      supplierEarning: 93,
      payload: { items: [{ name: "PVC Pipe", qty: 2 }], deliveryConfirmed: true },
    },
  });

  const laborIntent = await prisma.paymentIntent.create({
    data: {
      merchantReference: `EF-RESET-LABOR-${suffix}`,
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: customer.id,
      jobId: job.id,
      amount: 1000,
      commissionAmount: 70,
      recipientAmount: 930,
      state: "PAID",
    },
  });
  const materialIntent = await prisma.paymentIntent.create({
    data: {
      merchantReference: `EF-RESET-MAT-${suffix}`,
      provider: "PAYSTACK",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      userId: customer.id,
      jobId: job.id,
      materialOrderId: order.id,
      branchId: branch.id,
      amount: 100,
      commissionAmount: 7,
      recipientAmount: 93,
      state: "PAID",
    },
  });
  const repaymentIntent = await prisma.paymentIntent.create({
    data: {
      merchantReference: `EF-RESET-REPAY-${suffix}`,
      provider: "PAYSTACK",
      kind: "PROVIDER_REFUND_REPAYMENT",
      userId: providerUser.id,
      jobId: job.id,
      amount: 50,
      state: "PAID",
    },
  });
  const ambiguousIntent = await prisma.paymentIntent.create({
    data: {
      merchantReference: `EF-RESET-AMBIG-${suffix}`,
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: customer.id,
      jobId: null,
      materialOrderId: null,
      amount: 25,
      state: "FAILED",
      gatewayPayload: { note: "ambiguous orphan — no job/order proof" },
    },
  });

  await prisma.commissionLedger.create({
    data: {
      jobId: job.id,
      paymentIntentId: laborIntent.id,
      amount: 70,
      source: "labor_payment",
      totalPrice: 1000,
    },
  });
  await prisma.earning.create({
    data: {
      providerId: provider.id,
      jobId: job.id,
      amount: 930,
      type: "job",
      status: "available",
    },
  });
  await prisma.providerReview.create({
    data: {
      rating: 5,
      comment: "Great",
      customerId: customer.id,
      providerId: provider.id,
      jobId: job.id,
    },
  });
  await prisma.jobCompletionEvidence.create({
    data: {
      jobId: job.id,
      customerId: customer.id,
      providerId: providerUser.id,
      rating: 5,
      review: "Done",
    },
  });
  const dispute = await prisma.jobDispute.create({
    data: {
      jobId: job.id,
      customerId: customer.id,
      providerId: providerUser.id,
      requestedResolution: "FULL_REFUND",
      customerComment: "Issue",
    },
  });
  await prisma.disputeMessage.create({
    data: {
      disputeId: dispute.id,
      senderId: customer.id,
      senderRole: "CUSTOMER",
      body: "Please refund",
    },
  });
  await prisma.refundRecovery.create({
    data: {
      providerId: provider.id,
      customerId: customer.id,
      jobId: job.id,
      disputeId: dispute.id,
      totalPending: 50,
      status: "PENDING",
      dueAt: new Date(Date.now() + 86400000),
      reference: `RR-${suffix}`,
    },
  });
  await prisma.providerRefundRepayment.create({
    data: {
      providerId: provider.id,
      jobId: job.id,
      amount: 50,
      reference: `PR-${suffix}`,
      method: "GATEWAY",
      paymentIntentId: repaymentIntent.id,
      status: "CONFIRMED",
    },
  });
  await prisma.customerPaymentObligation.create({
    data: {
      customerId: customer.id,
      jobId: job.id,
      amount: 0,
      dueAt: new Date(),
      status: "PAID",
    },
  });
  await prisma.materialRequest.create({
    data: {
      jobId: job.id,
      providerId: providerUser.id,
      customerId: customer.id,
      items: [{ name: "PVC Pipe", qty: 2 }],
      totalAmount: 100,
      status: "paid",
    },
  });
  await prisma.paystackCharge.create({
    data: {
      jobId: job.id,
      paystackReference: `psk-reset-${suffix}`,
      status: "success",
      amountZar: 1000,
    },
  });

  const jobDelivery = await prisma.deliveryRequest.create({
    data: {
      customerId: customer.id,
      source: "job",
      jobId: job.id,
      materialOrderId: order.id,
      category: "delivery",
      items: [{ name: "PVC Pipe" }],
      collectionPoint: { lat: -33.9, lng: 18.4 },
      destinationPoint: { lat: -33.92, lng: 18.42 },
      status: "completed",
    },
  });
  const standaloneDelivery = await prisma.deliveryRequest.create({
    data: {
      customerId: customer.id,
      source: "direct",
      category: "moving",
      items: [{ name: "Sofa" }],
      collectionPoint: { lat: -33.9, lng: 18.4 },
      destinationPoint: { lat: -33.93, lng: 18.45 },
      status: "pending_quote",
    },
  });
  await prisma.trackingSession.create({
    data: {
      orderId: order.id,
      deliveryRequestId: jobDelivery.id,
      trackingId: `trk-${suffix}`,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await prisma.materialOrderRating.create({
    data: {
      orderId: order.id,
      providerId: provider.id,
      rating: 4,
      comment: "On time",
    },
  });
  await prisma.branchSettlementEvent.create({
    data: {
      branchId: branch.id,
      supplierId: supplier.id,
      materialOrderId: order.id,
      paymentIntentId: materialIntent.id,
      eventType: "MATERIAL_PAYMENT",
      grossAmount: 100,
      commissionAmount: 7,
      netAmount: 93,
      settlementStatus: "SETTLED",
    },
  });
  const payoutBatch = await prisma.gatewayPayoutSettlement.create({
    data: {
      gateway: "PAYSTACK",
      externalSettlementId: `settl-reset-${suffix}`,
      recipientType: "SUPPLIER_BRANCH",
      supplierId: supplier.id,
      branchId: branch.id,
      subaccountCode: "ACCT_selftest_branch",
      status: "SETTLED",
      grossRecipientShare: 93,
    },
  });
  await prisma.gatewayPayoutSettlementItem.create({
    data: {
      settlementId: payoutBatch.id,
      paymentIntentId: materialIntent.id,
      customerAmount: 100,
      commissionAmount: 7,
      recipientGrossShare: 93,
    },
  });
  await prisma.paymentWebhookEvent.create({
    data: {
      provider: "PAYSTACK",
      externalEventId: `evt-reset-${suffix}`,
      paymentIntentId: laborIntent.id,
      signatureValid: true,
      processedAt: new Date(),
    },
  });
  await prisma.paystackWebhookEvent.create({
    data: { eventId: `psk-evt-reset-${suffix}` },
  });
  await prisma.invoice.create({
    data: { userId: customer.id, jobId: job.id, payload: { total: 1000 } },
  });
  const conversation = await prisma.conversation.create({
    data: { senderId: customer.id, jobId: job.id, conversationType: "job" },
  });
  await prisma.notification.create({
    data: {
      userId: customer.id,
      type: "JOB_COMPLETED",
      title: "Job done",
      message: "Your job is complete",
      jobId: job.id,
      conversationId: conversation.id,
    },
  });
  await prisma.branchStaffNotification.create({
    data: {
      branchUserId: branchUser.id,
      type: "ORDER_PAID",
      title: "Paid",
      message: "Order paid",
      materialOrderId: order.id,
    },
  });
  await prisma.legalAcceptanceEvent.create({
    data: {
      userId: customer.id,
      role: "CUSTOMER",
      source: "REGISTER",
      termsVersion: "1.0",
      privacyVersion: "1.0",
    },
  });
  await prisma.legalAcceptanceEvent.create({
    data: {
      userId: customer.id,
      role: "CUSTOMER",
      source: "CHECKOUT",
      termsVersion: "1.0",
      paymentIntentId: laborIntent.id,
      jobId: job.id,
      merchantReference: laborIntent.merchantReference,
      paymentIntentKind: "LABOR",
    },
  });

  return {
    suffix,
    emails: {
      customer: customer.email,
      provider: providerUser.email,
      supplier: supplierUser.email,
      branchStaff: branchUser.email,
    },
    ids: {
      customerId: customer.id,
      providerUserId: providerUser.id,
      providerId: provider.id,
      supplierUserId: supplierUser.id,
      supplierId: supplier.id,
      branchId: branch.id,
      branchUserId: branchUser.id,
      providerBankId: providerBank.id,
      branchBankId: branchBank.id,
      inventoryCategoryId: inventoryCategory.id,
      jobId: job.id,
      orderId: order.id,
      laborIntentId: laborIntent.id,
      ambiguousIntentId: ambiguousIntent.id,
      payoutBatchId: payoutBatch.id,
      standaloneDeliveryId: standaloneDelivery.id,
      debtProviderId: debtProvider.id,
      fraudProviderId: fraudProvider.id,
    },
    inventoryProducts,
    documents: provider.documents,
    settings: provider.settings,
    skills: provider.skills,
  };
}

async function runWorker() {
  const prisma = require("../src/config/prisma");
  try {
    await runWorkerBody(prisma);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (globalThis.__elofixPgPool?.end) {
        await globalThis.__elofixPgPool.end();
      }
    } catch {
      /* ignore */
    }
  }
}

async function runWorkerBody(prisma) {
  const { runReset } = require("./reset-test-transactions");
  const authService = require("../src/services/auth.service");
  const { REFUND_DEBT_BLOCK_REASON: JOB_REFUND_DEBT_BLOCK_REASON } = require("../src/jobs/refundDebtEnforcement.job");
  assert.strictEqual(
    REFUND_DEBT_BLOCK_REASON,
    JOB_REFUND_DEBT_BLOCK_REASON,
    "reset script refund-debt reason must match enforcement job"
  );

  const fixtures = await seedFixtures(prisma);

  const dry = await runReset({ argv: ["node", "reset-test-transactions.js", "--dry-run"] });
  assert.strictEqual(dry.ok, true);
  assert.strictEqual(dry.dryRun, true);
  assert.ok(dry.plan.counts.jobs >= 1, "dry-run should count the seeded job");
  assert.ok(dry.plan.counts.materialOrders >= 1, "dry-run should count the seeded material order");
  assert.ok(dry.plan.counts.paymentIntents >= 3, "dry-run should count seeded payment intents");
  assert.ok(
    dry.plan.counts.trustScoresToRebuild >= 1,
    "dry-run should count provider trust scores to rebuild"
  );
  assert.ok(
    dry.plan.counts.refundDebtBlocksToClear >= 1,
    "dry-run should count refund-debt blocks to clear"
  );
  assert.ok(
    !dry.plan.ids.paymentIntentIds.includes(fixtures.ids.ambiguousIntentId),
    "ambiguous orphan PaymentIntent must not be in the delete plan"
  );

  const jobStillThere = await prisma.job.findUnique({ where: { id: fixtures.ids.jobId } });
  assert.ok(jobStillThere, "dry-run must not delete the job");
  const orderStillThere = await prisma.materialOrder.findUnique({ where: { id: fixtures.ids.orderId } });
  assert.ok(orderStillThere, "dry-run must not delete the material order");

  const webhookBefore = await prisma.paymentWebhookEvent.count();
  const paystackWebhookBefore = await prisma.paystackWebhookEvent.count();
  const settlementBefore = await prisma.gatewayPayoutSettlement.count();
  const legalAccountBefore = await prisma.legalAcceptanceEvent.count({
    where: { jobId: null, materialOrderId: null, paymentIntentId: null },
  });

  const destructive = await runReset({
    argv: ["node", "reset-test-transactions.js", `--confirm=${CONFIRM_TOKEN}`],
  });
  assert.strictEqual(destructive.ok, true);
  assert.strictEqual(destructive.dryRun, false);

  assert.strictEqual(await prisma.job.count(), 0);
  assert.strictEqual(await prisma.materialOrder.count(), 0);
  assert.strictEqual(
    await prisma.paymentIntent.count({
      where: { OR: [{ jobId: { not: null } }, { materialOrderId: { not: null } }] },
    }),
    0
  );
  assert.strictEqual(
    await prisma.notification.count({
      where: { OR: [{ jobId: fixtures.ids.jobId }, { materialOrderId: fixtures.ids.orderId }] },
    }),
    0
  );
  assert.strictEqual(await prisma.invoice.count({ where: { jobId: fixtures.ids.jobId } }), 0);
  assert.strictEqual(await prisma.conversation.count({ where: { jobId: fixtures.ids.jobId } }), 0);
  assert.strictEqual(
    await prisma.deliveryRequest.count({
      where: { OR: [{ jobId: fixtures.ids.jobId }, { materialOrderId: fixtures.ids.orderId }] },
    }),
    0
  );

  const standalone = await prisma.deliveryRequest.findUnique({
    where: { id: fixtures.ids.standaloneDeliveryId },
  });
  assert.ok(standalone, "standalone delivery request must be preserved");

  const ambiguousIntent = await prisma.paymentIntent.findUnique({
    where: { id: fixtures.ids.ambiguousIntentId },
  });
  assert.ok(ambiguousIntent, "ambiguous orphan PaymentIntent must be preserved");
  assert.strictEqual(ambiguousIntent.kind, "LABOR");
  assert.strictEqual(ambiguousIntent.jobId, null);
  assert.strictEqual(ambiguousIntent.materialOrderId, null);

  const trust = await prisma.providerTrustScore.findUnique({
    where: { providerId: fixtures.ids.providerId },
  });
  assert.ok(trust, "ProviderTrustScore row must remain");
  const trustReasons = (Array.isArray(trust.history) ? trust.history : []).map((e) => e.reason);
  assert.ok(trustReasons.includes("verified_id"), "verified_id trust event must remain");
  assert.ok(trustReasons.includes("verified_company"), "verified_company trust event must remain");
  assert.ok(trustReasons.includes("verified_bank"), "verified_bank trust event must remain");
  for (const reason of [
    "job_completed",
    "dispute_lost",
    "refund_request",
    "partial_refund",
    "full_refund",
    "positive_review",
    "five_star_review",
  ]) {
    assert.ok(!trustReasons.includes(reason), `${reason} trust event must be removed`);
  }
  assert.strictEqual(trust.completedJobs, 0);
  assert.strictEqual(trust.disputeCount, 0);
  assert.strictEqual(trust.refundCount, 0);
  assert.strictEqual(trust.positiveReviews, 0);

  const debtProviderAfter = await prisma.provider.findUnique({
    where: { id: fixtures.ids.debtProviderId },
  });
  assert.ok(debtProviderAfter, "refund-debt provider account must remain");
  assert.strictEqual(debtProviderAfter.refundDebtBlockedAt, null);
  assert.strictEqual(debtProviderAfter.blocked, false);
  assert.strictEqual(debtProviderAfter.blockedReason, null);
  assert.strictEqual(debtProviderAfter.blockedAt, null);

  const fraudProviderAfter = await prisma.provider.findUnique({
    where: { id: fixtures.ids.fraudProviderId },
  });
  assert.ok(fraudProviderAfter, "fraud-blocked provider account must remain");
  assert.strictEqual(fraudProviderAfter.blocked, true);
  assert.strictEqual(fraudProviderAfter.blockedReason, "Admin fraud review — fake documentation");
  assert.ok(fraudProviderAfter.blockedAt, "unrelated admin/fraud block timestamp must remain");

  const customer = await prisma.user.findUnique({ where: { id: fixtures.ids.customerId } });
  const providerUser = await prisma.user.findUnique({ where: { id: fixtures.ids.providerUserId } });
  const supplierUser = await prisma.user.findUnique({ where: { id: fixtures.ids.supplierUserId } });
  const provider = await prisma.provider.findUnique({ where: { id: fixtures.ids.providerId } });
  const supplier = await prisma.supplier.findUnique({ where: { id: fixtures.ids.supplierId } });
  const branch = await prisma.branch.findUnique({ where: { id: fixtures.ids.branchId } });
  const branchUser = await prisma.branchUser.findUnique({ where: { id: fixtures.ids.branchUserId } });
  const providerBank = await prisma.providerWithdrawalProfile.findUnique({
    where: { id: fixtures.ids.providerBankId },
  });
  const branchBank = await prisma.branchWithdrawalProfile.findUnique({
    where: { id: fixtures.ids.branchBankId },
  });
  const category = await prisma.category.findUnique({ where: { id: "plumbing" } });
  const inventoryCategory = await prisma.branchInventoryCategory.findUnique({
    where: { id: fixtures.ids.inventoryCategoryId },
  });
  const payoutBatch = await prisma.gatewayPayoutSettlement.findUnique({
    where: { id: fixtures.ids.payoutBatchId },
  });

  assert.ok(customer && providerUser && supplierUser, "users must remain");
  assert.ok(provider, "provider profile must remain");
  assert.ok(supplier, "supplier profile must remain");
  assert.ok(branch, "branch must remain");
  assert.ok(branchUser, "branch user must remain");
  assert.ok(providerBank, "provider bank profile must remain");
  assert.ok(branchBank, "branch bank profile must remain");
  assert.ok(category, "category must remain");
  assert.ok(inventoryCategory, "branch inventory category must remain");
  assert.ok(payoutBatch, "gateway payout settlement batch must remain");
  assert.strictEqual(provider.approved, true);
  assert.deepStrictEqual(provider.skills, fixtures.skills);
  assert.deepStrictEqual(provider.documents, fixtures.documents);
  assert.deepStrictEqual(provider.settings, fixtures.settings);
  assert.strictEqual(provider.rating, 0);
  assert.strictEqual(provider.totalReviews, 0);
  assert.deepStrictEqual(branch.products, fixtures.inventoryProducts);
  assert.deepStrictEqual(supplier.products, fixtures.inventoryProducts);
  assert.strictEqual(providerBank.gatewayRecipientId, "ACCT_selftest_provider");
  assert.strictEqual(branchBank.gatewayRecipientId, "ACCT_selftest_branch");

  assert.strictEqual(await prisma.paymentWebhookEvent.count(), webhookBefore);
  assert.strictEqual(await prisma.paystackWebhookEvent.count(), paystackWebhookBefore);
  assert.strictEqual(await prisma.gatewayPayoutSettlement.count(), settlementBefore);
  assert.strictEqual(
    await prisma.legalAcceptanceEvent.count({
      where: { jobId: null, materialOrderId: null, paymentIntentId: null },
    }),
    legalAccountBefore
  );
  assert.strictEqual(
    await prisma.legalAcceptanceEvent.count({
      where: { OR: [{ jobId: { not: null } }, { paymentIntentId: { not: null } }] },
    }),
    0
  );

  const customerLogin = await authService.login({ email: fixtures.emails.customer, password: PASSWORD });
  const providerLogin = await authService.login({ email: fixtures.emails.provider, password: PASSWORD });
  const supplierLogin = await authService.login({ email: fixtures.emails.supplier, password: PASSWORD });
  assert.ok(customerLogin.token && customerLogin.user.role === "CUSTOMER");
  assert.ok(providerLogin.token && providerLogin.user.role === "PROVIDER");
  assert.ok(supplierLogin.token && supplierLogin.user.role === "SUPPLIER");
  const staffPasswordOk = await bcrypt.compare(PASSWORD, branchUser.password);
  assert.ok(staffPasswordOk, "branch staff password hash must still verify");

  console.log("reset-test-transactions.selftest: OK");
}

async function runHarness() {
  assertParseArgs();
  console.log("parseArgs checks: OK");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to create the disposable test database");
  }
  const sourceUrl = process.env.DATABASE_URL;
  const srcName = sourceDatabaseName(sourceUrl);
  console.log(`Source DATABASE_URL database: ${srcName}`);
  console.log(`Disposable database: ${DISPOSABLE_DB}`);
  if (srcName === DISPOSABLE_DB) {
    throw new Error("DATABASE_URL already points at the disposable database; refusing to continue");
  }

  const disposableUrl = await recreateDisposableDatabase(sourceUrl);
  try {
    pushSchema(disposableUrl);
    const worker = spawnSync(process.execPath, [__filename], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: disposableUrl,
        NODE_ENV: "test",
        ELOFIX_RESET_TX_SELFTEST_WORKER: "1",
      },
    });
    if (worker.status !== 0) {
      throw new Error(`selftest worker failed (exit ${worker.status})`);
    }
  } finally {
    await dropDisposableDatabase(sourceUrl);
    console.log(`dropped disposable database ${DISPOSABLE_DB}`);
  }
}

async function main() {
  if (process.env.ELOFIX_RESET_TX_SELFTEST_WORKER === "1") {
    await runWorker();
    return;
  }
  await runHarness();
}

main().catch((err) => {
  console.error("reset-test-transactions.selftest failed:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
});
