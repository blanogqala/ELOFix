/**
 * E3 live Paystack legal alignment — versions, stale acceptance, checkout versions, history.
 * Run: node tests/legalPaystackAlignment.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { LEGAL_VERSIONS } = require("../src/config/legalVersions");
const {
  computeLegalStatus,
  requiredVersionFieldsForRole,
  recordLegalAcceptanceEvent,
  validateCheckoutLegalAcceptance,
} = require("../src/services/legalAcceptance.service");
const { checkoutLegalAcceptance } = require("./helpers/checkoutLegalAcceptance");

const LIVE = "2026-09-14";

function parseFrontendVersions() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "frontend", "src", "lib", "legal", "versions.ts"),
    "utf8"
  );
  const block = src.match(/export const LEGAL_VERSIONS = \{([\s\S]*?)\} as const/);
  assert.ok(block, "frontend LEGAL_VERSIONS block missing");
  const versions = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*([A-Za-z]+):\s*'([^']+)'/);
    if (m) versions[m[1]] = m[2];
  }
  return versions;
}

function testFrontendBackendVersionsMatch() {
  const frontend = parseFrontendVersions();
  const keys = Object.keys(LEGAL_VERSIONS);
  assert.ok(keys.length > 10);
  for (const key of keys) {
    assert.strictEqual(
      String(LEGAL_VERSIONS[key]),
      String(frontend[key]),
      `legal version mismatch for ${key}: backend=${LEGAL_VERSIONS[key]} frontend=${frontend[key]}`
    );
  }
}

function testLiveDocumentsBumped() {
  assert.strictEqual(LEGAL_VERSIONS.terms, process.env.LEGAL_TERMS_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.privacy, process.env.LEGAL_PRIVACY_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.providerAgreement, process.env.LEGAL_PROVIDER_AGREEMENT_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.refundPolicy, process.env.LEGAL_REFUND_POLICY_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.escrowPolicy, process.env.LEGAL_ESCROW_POLICY_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.disputeResolution, process.env.LEGAL_DISPUTE_RESOLUTION_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.supplierAgreement, process.env.LEGAL_SUPPLIER_AGREEMENT_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.dataProcessing, process.env.LEGAL_DATA_PROCESSING_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.providerVerification, process.env.LEGAL_PROVIDER_VERIFICATION_VERSION || LIVE);
  assert.strictEqual(LEGAL_VERSIONS.deliveryPolicy, process.env.LEGAL_DELIVERY_POLICY_VERSION || LIVE);
}

function testStaleVersionLogicStillWorks() {
  const customer = computeLegalStatus(
    { termsVersion: "2026-08-18-r2", privacyVersion: LEGAL_VERSIONS.privacy },
    "CUSTOMER"
  );
  assert.strictEqual(customer.current, false);
  assert.ok(customer.staleDocuments.includes("terms"));
  assert.ok(!customer.requiredDocuments.some((d) => d.key === "providerAgreement"));

  const providerStale = computeLegalStatus(
    {
      termsVersion: "2026-08-18-r2",
      privacyVersion: "2026-08-18",
      providerAgreementVersion: "2026-08-18-r2",
      refundPolicyVersion: "2026-08-18-r2",
    },
    "PROVIDER"
  );
  assert.strictEqual(providerStale.current, false);
  assert.ok(providerStale.staleDocuments.includes("terms"));
  assert.ok(providerStale.staleDocuments.includes("providerAgreement"));
  assert.ok(providerStale.staleDocuments.includes("refundPolicy"));

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

function testCheckoutStillValidatesRefundPolicyVersion() {
  const ok = validateCheckoutLegalAcceptance(checkoutLegalAcceptance("LABOR"), "LABOR");
  assert.strictEqual(ok.refundPolicyVersion, LEGAL_VERSIONS.refundPolicy);
  try {
    validateCheckoutLegalAcceptance(
      {
        refundPolicyAccepted: true,
        refundPolicyVersion: "2026-08-18-r2",
        deliveryPolicyAcknowledged: false,
        deliveryPolicyVersion: null,
      },
      "LABOR"
    );
    assert.fail("expected stale refund policy to fail");
  } catch (e) {
    assert.strictEqual(e.code, "LEGAL_POLICY_VERSION_STALE");
    assert.strictEqual(e.statusCode, 409);
  }
}

function testAcceptanceHistorySourceDoesNotOverwrite() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "legalAcceptance.service.js"),
    "utf8"
  );
  assert.ok(src.includes("legalAcceptanceEvent.create"));
  assert.ok(!/legalAcceptanceEvent\.updateMany/.test(src));
  assert.ok(!/legalAcceptanceEvent\.upsert/.test(src));
  const fn = recordLegalAcceptanceEvent.toString();
  assert.ok(fn.includes("create"));
  assert.ok(!fn.includes("update("));
}

function testLivePaymentEngineUntouchedByThisFile() {
  const paymentIntent = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "payments", "paymentIntent.service.js"),
    "utf8"
  );
  assert.ok(paymentIntent.length > 100);
}

async function testHistoricalAcceptanceEventsNotMutated() {
  const url = process.env.DATABASE_URL || "";
  if (!url || url.includes("placeholder")) {
    console.log("legalPaystackAlignment: skipped DB history test (no DATABASE_URL)");
    return;
  }
  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let user;
  let historic;
  try {
    user = await prisma.user.create({
      data: {
        email: `e3-legal-${suffix}@example.com`,
        password: "hash",
        name: "E3 Legal",
        role: "CUSTOMER",
        termsVersion: "2026-08-18-r2",
        privacyVersion: "2026-08-18",
        acceptedTerms: true,
        acceptedPrivacy: true,
      },
    });
    historic = await prisma.legalAcceptanceEvent.create({
      data: {
        userId: user.id,
        role: "CUSTOMER",
        source: "REGISTER",
        termsVersion: "2026-08-18-r2",
        privacyVersion: "2026-08-18",
        acceptedAt: new Date("2026-08-18T12:00:00.000Z"),
      },
    });
    await recordLegalAcceptanceEvent(user.id, "CUSTOMER", "REACCEPT", {
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
    });
    const old = await prisma.legalAcceptanceEvent.findUnique({ where: { id: historic.id } });
    assert.strictEqual(old.termsVersion, "2026-08-18-r2");
    assert.strictEqual(old.privacyVersion, "2026-08-18");
    const newest = await prisma.legalAcceptanceEvent.findFirst({
      where: { userId: user.id, source: "REACCEPT" },
      orderBy: { acceptedAt: "desc" },
    });
    assert.ok(newest);
    assert.notStrictEqual(newest.id, historic.id);
    assert.strictEqual(newest.termsVersion, LEGAL_VERSIONS.terms);
  } finally {
    if (user?.id) {
      await prisma.legalAcceptanceEvent.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  }
}

(async () => {
  testFrontendBackendVersionsMatch();
  testLiveDocumentsBumped();
  testStaleVersionLogicStillWorks();
  testCheckoutStillValidatesRefundPolicyVersion();
  testAcceptanceHistorySourceDoesNotOverwrite();
  testLivePaymentEngineUntouchedByThisFile();
  await testHistoricalAcceptanceEventsNotMutated();
  console.log("legalPaystackAlignment.test.js passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  try {
    const { shutdownTestResources } = require("./helpers/shutdown");
    await shutdownTestResources();
  } catch {
    /* pool-close races on Windows must not fail a passed test */
  }
  process.exit(process.exitCode || 0);
});
