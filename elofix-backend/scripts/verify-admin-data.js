/**
 * Smoke-check admin financial reads for a customer with delivery + service jobs.
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const adminCustomers = require("../src/services/adminCustomers.service");
const adminAnalytics = require("../src/services/adminAnalytics.service");
const jobMeta = require("../src/services/jobMeta.service");
const { paidAmountFromJob } = require("../src/utils/jobPaidAmount.util");

async function main() {
  const customerId = process.argv[2] || "73f5a694-014b-4950-91a4-e87b1bb1bf64";
  const detail = await adminCustomers.getCustomerById(customerId);
  if (!detail) {
    console.error("Customer not found");
    process.exit(1);
  }
  console.log("Customer totalPaid:", detail.totalPaid);
  detail.jobs.forEach((j) => console.log(" -", j.title, "paid:", j.totalPaid));

  const analytics = await adminAnalytics.getAnalytics({});
  console.log("Analytics totalRevenue (last 30d bucket sum):", analytics.summary.totalRevenue);

  const jobs = await prisma.job.findMany({ where: { customerId } });
  jobs.forEach((row) => {
    const enriched = jobMeta.enrichJob(row, row.meta);
    console.log(
      "Job API fields:",
      row.title,
      "customerPaidTotal=",
      enriched.customerPaidTotal,
      "util=",
      paidAmountFromJob(row)
    );
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
