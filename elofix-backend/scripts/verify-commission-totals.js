/**
 * Smoke-check: dashboard commission = providers labor commission + suppliers material commission.
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const { getCommissionSummary } = require("../src/services/commission.service");
const providerService = require("../src/services/provider.service");
const materialOrderService = require("../src/services/materialOrder.service");

async function main() {
  const [comm, providerRows, materialAgg] = await Promise.all([
    getCommissionSummary({ from: "2000-01-01", to: new Date().toISOString().slice(0, 10) }),
    providerService.listProviderNetRevenues(),
    materialOrderService.aggregatePaidMaterialOrders({}),
  ]);

  const laborFromProviders = providerRows.reduce(
    (s, r) => s + (Number(r.platformCommission) || 0),
    0
  );
  const materialFromSuppliers = Number(materialAgg.totalCommission) || 0;
  const expected = Math.round((laborFromProviders + materialFromSuppliers + Number.EPSILON) * 100) / 100;

  console.log("Providers labor commission:", laborFromProviders);
  console.log("Suppliers material commission:", materialFromSuppliers);
  console.log("Expected total (providers + suppliers):", expected);
  console.log("Dashboard API totalLaborCommission:", comm.totalLaborCommission);
  console.log("Dashboard API totalMaterialCommission:", comm.totalMaterialCommission);
  console.log("Dashboard API totalCommission:", comm.totalCommission);

  const ok =
    Math.abs(comm.totalLaborCommission - laborFromProviders) < 0.02 &&
    Math.abs(comm.totalMaterialCommission - materialFromSuppliers) < 0.02 &&
    Math.abs(comm.totalCommission - expected) < 0.02;

  if (!ok) {
    console.error("MISMATCH — totals do not reconcile");
    process.exit(1);
  }
  console.log("OK — commission totals reconcile");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
