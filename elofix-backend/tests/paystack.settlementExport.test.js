/**
 * Paystack settlement transaction export fallback (CSV/URL safety).
 * Run: node tests/paystack.settlementExport.test.js
 */
const assert = require("assert");
const {
  assertAllowedExportUrl,
  downloadPaystackExportCsv,
  isAllowedPaystackExportHostname,
  safeExportUrlForLog,
  transactionsFromExportCsv,
} = require("../src/services/payments/paystack.settlementExport");
const { splitCommission } = require("../src/services/payments/money.util");

async function run() {
  const split = splitCommission(100);
  assert.strictEqual(Number(split.commissionAmount), 7);
  assert.strictEqual(Number(split.recipientAmount), 93);

  assert.strictEqual(isAllowedPaystackExportHostname("files.paystack.co"), true);
  assert.strictEqual(isAllowedPaystackExportHostname("s3.eu-west-1.amazonaws.com"), true);
  assert.strictEqual(isAllowedPaystackExportHostname("evil.example.com"), false);
  assert.throws(() => assertAllowedExportUrl("http://files.paystack.co/exports/a.csv"), /HTTPS/i);
  assert.throws(() => assertAllowedExportUrl("https://evil.example.com/a.csv"), /not allowed/i);

  const signed = "https://files.paystack.co/exports/100/x.csv?X-Amz-Signature=secretvalue";
  assert.strictEqual(safeExportUrlForLog(signed), "https://files.paystack.co/exports/100/x.csv");
  assert.doesNotMatch(safeExportUrlForLog(signed), /secretvalue/);

  const membership = transactionsFromExportCsv(
    "Reference,Fees,Amount\nEF-TEST,2.82,50.00\n"
  );
  assert.strictEqual(membership.length, 1);
  assert.strictEqual(membership[0].reference, "EF-TEST");
  assert.ok(!Object.prototype.hasOwnProperty.call(membership[0], "fees"));
  assert.ok(!Object.prototype.hasOwnProperty.call(membership[0], "fees_split"));
  assert.ok(!Object.prototype.hasOwnProperty.call(membership[0], "amount"));
  assert.ok(!Object.prototype.hasOwnProperty.call(membership[0], "bearer"));

  const integerCsv = transactionsFromExportCsv("Reference,Fees,Amount\nEF-TEST,282,5000\n");
  assert.strictEqual(integerCsv[0].reference, "EF-TEST");
  assert.ok(!Object.prototype.hasOwnProperty.call(integerCsv[0], "fees"));
  assert.ok(!Object.prototype.hasOwnProperty.call(integerCsv[0], "amount"));
  assert.ok(!Object.prototype.hasOwnProperty.call(integerCsv[0], "fees_split"));
  assert.ok(!Object.prototype.hasOwnProperty.call(integerCsv[0], "bearer"));

  const reordered = transactionsFromExportCsv(
    "Fees,Status,Customer Email,Reference,Amount\n2.82,success,hidden@example.com,EF-TEST,50.00\n"
  );
  assert.strictEqual(reordered.length, 1);
  assert.strictEqual(reordered[0].reference, "EF-TEST");
  assert.strictEqual(reordered[0].status, "success");
  assert.ok(!Object.prototype.hasOwnProperty.call(reordered[0], "fees"));
  assert.ok(!JSON.stringify(reordered[0]).includes("hidden@example.com"));

  const emptyCsv = transactionsFromExportCsv("Reference,Status\n");
  assert.deepStrictEqual(emptyCsv, []);

  await assert.rejects(
    () =>
      downloadPaystackExportCsv("https://files.paystack.co/exports/x.csv", {
        timeoutMs: 20,
        fetchImpl: async () => {
          const err = new Error("aborted");
          err.name = "TimeoutError";
          throw err;
        },
      }),
    (err) => err.code === "PAYSTACK_EXPORT_TIMEOUT"
  );

  await assert.rejects(
    () =>
      downloadPaystackExportCsv("https://files.paystack.co/exports/x.csv", {
        maxBytes: 10,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: (name) => (String(name).toLowerCase() === "content-length" ? "999999" : null) },
          body: null,
          arrayBuffer: async () => new Uint8Array(0).buffer,
        }),
      }),
    (err) => err.code === "PAYSTACK_EXPORT_TOO_LARGE"
  );

  console.log("paystack.settlementExport.test.js: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
