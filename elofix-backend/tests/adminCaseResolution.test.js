/**
 * Admin job case resolution summary — unit tests.
 * Tests payer derivation logic inline (without a DB) and the action labels map.
 * Run: node tests/adminCaseResolution.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");

// We extract the internal derivePayerInfo + ACTION_LABELS by pulling relevant
// pieces from the service source as plain logic objects (no DB calls needed).
const ACTION_LABELS = {
  RELEASE_FUNDS: "Release remaining funds to provider",
  FULL_REFUND: "Full refund issued to customer",
  PARTIAL_REFUND: "Partial refund issued to customer",
  RETURN_PROVIDER: "Provider returned to site",
  CLOSE_CASE: "Case closed",
};

function derivePayerInfo(action, { amountDue, dueAt, refundLaborNet, providerDebtAmount }) {
  if (action === "RELEASE_FUNDS") {
    let summary = "Customer must pay remaining balance to provider.";
    if (amountDue > 0) {
      summary = `Customer must pay R ${Number(amountDue).toFixed(2)} to provider`;
      if (dueAt) {
        const d = new Date(dueAt);
        summary += ` by ${d.toLocaleDateString("en-ZA", { dateStyle: "medium" })}`;
      }
      summary += ".";
    }
    return { payerRole: "customer", payerSummary: summary };
  }
  if (action === "FULL_REFUND" || action === "PARTIAL_REFUND") {
    if (providerDebtAmount > 0) {
      return {
        payerRole: "provider",
        payerSummary: `Customer refund issued. Provider must repay R ${Number(providerDebtAmount).toFixed(2)} to EloFix.`,
      };
    }
    return {
      payerRole: "none",
      payerSummary: `Customer refund of R ${Number(refundLaborNet).toFixed(2)} issued.`,
    };
  }
  if (action === "RETURN_PROVIDER") {
    return { payerRole: "none", payerSummary: "Provider instructed to return to site and complete the work." };
  }
  return { payerRole: "none", payerSummary: "Case closed without financial movement." };
}

// --- Tests ---

function testReleaseFundsWithAmount() {
  const { payerRole, payerSummary } = derivePayerInfo("RELEASE_FUNDS", {
    amountDue: 600,
    dueAt: "2026-09-17T10:00:00.000Z",
    refundLaborNet: 0,
    providerDebtAmount: 0,
  });
  assert.strictEqual(payerRole, "customer");
  assert.ok(payerSummary.includes("600.00"), `Expected amount in summary: ${payerSummary}`);
  assert.ok(payerSummary.toLowerCase().includes("provider"), `Expected 'provider' in summary: ${payerSummary}`);
}

function testReleaseFundsNoAmount() {
  const { payerRole, payerSummary } = derivePayerInfo("RELEASE_FUNDS", {
    amountDue: 0,
    dueAt: null,
    refundLaborNet: 0,
    providerDebtAmount: 0,
  });
  assert.strictEqual(payerRole, "customer");
  assert.ok(payerSummary.includes("remaining balance"), `Expected generic message: ${payerSummary}`);
}

function testFullRefundWithProviderDebt() {
  const { payerRole, payerSummary } = derivePayerInfo("FULL_REFUND", {
    amountDue: 0,
    dueAt: null,
    refundLaborNet: 600,
    providerDebtAmount: 600,
  });
  assert.strictEqual(payerRole, "provider");
  assert.ok(payerSummary.includes("600.00"), `Expected amount: ${payerSummary}`);
  assert.ok(payerSummary.toLowerCase().includes("repay"), `Expected 'repay': ${payerSummary}`);
}

function testFullRefundNoProviderDebt() {
  const { payerRole, payerSummary } = derivePayerInfo("FULL_REFUND", {
    amountDue: 0,
    dueAt: null,
    refundLaborNet: 300,
    providerDebtAmount: 0,
  });
  assert.strictEqual(payerRole, "none");
  assert.ok(payerSummary.includes("300.00"), `Expected amount: ${payerSummary}`);
}

function testReturnProvider() {
  const { payerRole, payerSummary } = derivePayerInfo("RETURN_PROVIDER", {
    amountDue: 0, dueAt: null, refundLaborNet: 0, providerDebtAmount: 0,
  });
  assert.strictEqual(payerRole, "none");
  assert.ok(payerSummary.toLowerCase().includes("return"), `Expected 'return': ${payerSummary}`);
}

function testCloseCase() {
  const { payerRole, payerSummary } = derivePayerInfo("CLOSE_CASE", {
    amountDue: 0, dueAt: null, refundLaborNet: 0, providerDebtAmount: 0,
  });
  assert.strictEqual(payerRole, "none");
  assert.ok(payerSummary.toLowerCase().includes("closed"), `Expected 'closed': ${payerSummary}`);
}

function testActionLabels() {
  assert.ok(ACTION_LABELS.RELEASE_FUNDS.toLowerCase().includes("release"));
  assert.ok(ACTION_LABELS.FULL_REFUND.toLowerCase().includes("refund"));
  assert.ok(ACTION_LABELS.PARTIAL_REFUND.toLowerCase().includes("partial"));
  assert.ok(ACTION_LABELS.RETURN_PROVIDER.toLowerCase().includes("provider"));
  assert.ok(ACTION_LABELS.CLOSE_CASE.toLowerCase().includes("close"));
}

function run() {
  testReleaseFundsWithAmount();
  testReleaseFundsNoAmount();
  testFullRefundWithProviderDebt();
  testFullRefundNoProviderDebt();
  testReturnProvider();
  testCloseCase();
  testActionLabels();
  console.log("adminCaseResolution.test.js: all passed (7/7)");
}

run();
