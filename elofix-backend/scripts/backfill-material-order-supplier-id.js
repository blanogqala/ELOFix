require("dotenv/config");
const prisma = require("../src/config/prisma");

async function main() {
  const n = await prisma.$executeRawUnsafe(`
    UPDATE "MaterialOrder"
    SET "supplierId" = payload->>'storeId'
    WHERE "supplierId" IS NULL
      AND payload->>'storeId' IS NOT NULL
      AND trim(payload->>'storeId') <> ''
  `);
  console.log(`Updated rows: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
