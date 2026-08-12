/**
 * payoutDestination.service — material change + settlement readiness.
 * Run: node tests/payoutDestination.test.js
 */
require("dotenv").config();
const bankCrypto = require("../src/utils/bankCrypto");
const payoutDestinationService = require("../src/services/payoutDestination.service");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const existing = {
    bankName: "FNB",
    accountHolder: "Jane",
    accountNumber: bankCrypto.encryptField("1234567890"),
    branchCode: bankCrypto.encryptField("250655"),
    accountType: "CHEQUE",
  };

  assert(
    !payoutDestinationService.detectMaterialBankChange(existing, {
      bankName: "FNB",
      accountHolder: "Jane",
      accountNumber: "1234567890",
      branchCode: "250655",
      accountType: "CHEQUE",
    }),
    "same details should not be material change"
  );

  assert(
    payoutDestinationService.detectMaterialBankChange(existing, {
      bankName: "ABSA",
      accountHolder: "Jane",
      accountNumber: "1234567890",
      branchCode: "250655",
      accountType: "CHEQUE",
    }),
    "bank name change should be material"
  );

  const ready = await payoutDestinationService.assertSettlementDestinationReady({
    scope: "branch",
    entityId: "00000000-0000-0000-0000-000000000000",
  });
  assert(!ready.ready, "missing profile should not be ready");

  console.log("payoutDestination.test.js: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
