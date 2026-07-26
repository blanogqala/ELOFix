/**
 * Provider/customer "delete job" must hide from that actor's list only —
 * the job row stays so the other party still sees it.
 *
 * Run: node tests/jobDeleteHidesForActorOnly.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const jobService = require("../src/services/job.service");

async function run() {
  assert.strictEqual(typeof jobService.deleteJob, "function");
  assert.strictEqual(typeof jobService.getJobsForActor, "function");

  if (!process.env.DATABASE_URL) {
    console.log("jobDeleteHidesForActorOnly.test.js: OK (unit only, DATABASE_URL not set)");
    return;
  }

  const prisma = require("../src/config/prisma");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let customer;
  let provider;
  let jobId;

  try {
    customer = await prisma.user.create({
      data: {
        email: `hide-cust-${suffix}@example.com`,
        password: "hashed-placeholder",
        name: "Hide Customer",
        role: "CUSTOMER",
      },
    });
    provider = await prisma.user.create({
      data: {
        email: `hide-prov-${suffix}@example.com`,
        password: "hashed-placeholder",
        name: "Hide Provider",
        role: "PROVIDER",
      },
    });
    jobId = randomUUID();
    await prisma.job.create({
      data: {
        id: jobId,
        title: `Material delivery hide ${suffix}`,
        category: "delivery",
        location: "Cape Town",
        description: "Cancelled courier for list hide test",
        price: 100,
        customerId: customer.id,
        providerId: provider.id,
        status: "CANCELLED",
        meta: { courierFlow: true },
      },
    });

    const result = await jobService.deleteJob(jobId, provider.id, "PROVIDER");
    assert.strictEqual(result.id, jobId);
    assert.strictEqual(result.hidden, true);

    const stillThere = await prisma.job.findUnique({ where: { id: jobId } });
    assert.ok(stillThere, "job row must not be hard-deleted");
    assert.ok(
      Array.isArray(stillThere.meta?.hiddenFromJobListByUserIds) &&
        stillThere.meta.hiddenFromJobListByUserIds.includes(provider.id),
      "provider id recorded in hiddenFromJobListByUserIds"
    );

    const providerList = await jobService.getJobsForActor(provider.id, "PROVIDER");
    assert.ok(
      !providerList.some((j) => String(j.id) === String(jobId)),
      "provider list must omit hidden job"
    );

    const customerList = await jobService.getJobsForActor(customer.id, "CUSTOMER");
    assert.ok(
      customerList.some((j) => String(j.id) === String(jobId)),
      "customer must still see the job after provider hides it"
    );

    let providerDetailBlocked = false;
    try {
      await jobService.getJobByIdForActor(jobId, provider.id, "PROVIDER");
    } catch (e) {
      providerDetailBlocked = e.statusCode === 404;
    }
    assert.strictEqual(providerDetailBlocked, true);

    const customerDetail = await jobService.getJobByIdForActor(jobId, customer.id, "CUSTOMER");
    assert.strictEqual(String(customerDetail.id), String(jobId));

    console.log("jobDeleteHidesForActorOnly.test.js: OK");
  } finally {
    if (jobId) await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    if (customer) await prisma.user.delete({ where: { id: customer.id } }).catch(() => {});
    if (provider) await prisma.user.delete({ where: { id: provider.id } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
