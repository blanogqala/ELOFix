require("dotenv").config();
const prisma = require("../src/config/prisma");
const { countJobsByStatus } = require("../src/utils/jobStatusCounts.util");
const jobMeta = require("../src/services/jobMeta.service");
const adminCustomers = require("../src/services/adminCustomers.service");

async function main() {
  const jobs = await prisma.job.findMany({
    select: { id: true, status: true, meta: true, customerId: true, paymentReleased: true, isFullyReleased: true },
  });
  console.log("All jobs buckets:", countJobsByStatus(jobs));
  jobs.forEach((j) => {
    const m = jobMeta.normalizeMeta(j.meta);
    const enriched = jobMeta.enrichJob(j, m);
    console.log(
      j.id.slice(-8),
      "db=" + j.status,
      "api=" + enriched.status,
      "override=" + m.statusOverride,
      "confirmed=" + m.completionConfirmedByUser,
      "payment=" + enriched.paymentSettlementStatus
    );
  });

  const customers = await adminCustomers.listCustomers({});
  const bath = customers.customers.find((c) => (c.email || "").includes("bla@gmail"));
  if (bath) {
    console.log("Bathandwa jobCounts:", bath.jobCounts);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
