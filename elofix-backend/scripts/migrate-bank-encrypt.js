/**
 * Encrypt legacy plaintext bank fields. Run once after SECRET_KEY and BANK_KDF_SALT are set.
 * node scripts/migrate-bank-encrypt.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const bankCrypto = require("../src/utils/bankCrypto");

async function main() {
  const rows = await prisma.providerWithdrawalProfile.findMany();
  let n = 0;
  for (const row of rows) {
    const acc = String(row.accountNumber || "");
    const br = String(row.branchCode || "");
    if (bankCrypto.isEncryptedStored(acc) && bankCrypto.isEncryptedStored(br)) continue;

    await prisma.providerWithdrawalProfile.update({
      where: { id: row.id },
      data: {
        accountNumber: bankCrypto.isEncryptedStored(acc) ? acc : bankCrypto.encryptField(acc),
        branchCode: bankCrypto.isEncryptedStored(br) ? br : bankCrypto.encryptField(br),
      },
    });
    n += 1;
  }
  console.log(`Migrated ${n} profile(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
