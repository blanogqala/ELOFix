process.env.DATABASE_URL ||= "postgresql://localhost/unit_test_unused";
const assert = require("assert");
const prisma = require("../src/config/prisma");
const jobService = require("../src/services/job.service");
const obligations = require("../src/services/customerPaymentObligation.service");

(async () => {
  const originals = [];
  const mock = (object, key, value) => {
    const previous = object[key];
    originals.push(() => {
      object[key] = previous;
    });
    object[key] = value;
  };

  let jobReads = 0;
  const past = new Date(Date.now() - 1000);
  const future = new Date(Date.now() + 86400000);
  const openRow = {
    id: "debt",
    jobId: "job",
    status: "DUE",
    amount: 500,
    restrictionStartsAt: past,
    dueAt: future,
    job: { status: "IN_PROGRESS", paymentProgress: "FIRST_PAID" },
  };
  let rows = [openRow];
  let user = {
    id: "customer",
    role: "CUSTOMER",
    blocked: false,
    marketplaceRestricted: true,
    marketplaceRestrictedReason: obligations.MARKETPLACE_RESTRICT_REASON,
  };

  try {
    mock(prisma.job, "findUnique", async () => {
      jobReads += 1;
      throw new Error("terminal status must be rejected before the job is loaded");
    });
    mock(prisma.job, "update", async () => {
      throw new Error("terminal status must not write the job");
    });

    for (const status of ["COMPLETED", "completed", "CANCELLED", "cancelled"]) {
      await assert.rejects(
        () => jobService.updateJobStatus("job-1", status, "customer", "CUSTOMER"),
        (err) => err.statusCode === 400,
        status
      );
    }
    assert.strictEqual(jobReads, 0);

    mock(prisma.customerPaymentObligation, "findMany", async () => rows);
    mock(prisma.jobDispute, "findFirst", async () => null);
    mock(prisma.user, "findUnique", async () => user);
    mock(prisma.user, "updateMany", async () => ({ count: 0 }));
    mock(prisma.auditLog, "create", async () => ({}));

    rows = [{ ...openRow, job: { status: "COMPLETED", paymentProgress: "FIRST_PAID" } }];
    assert.strictEqual(await obligations.customerHasQualifyingUnpaidObligation("customer"), true);
    await assert.rejects(
      () => obligations.assertCustomerMarketplaceSpendAllowed("customer"),
      (err) => err.statusCode === 403
    );

    rows = [{ ...openRow, job: { status: "COMPLETED", paymentProgress: "FULLY_PAID" } }];
    assert.strictEqual(await obligations.customerHasQualifyingUnpaidObligation("customer"), false);

    rows = [{ ...openRow, job: { status: "CANCELLED", paymentProgress: "FIRST_PAID" } }];
    assert.strictEqual(await obligations.customerHasQualifyingUnpaidObligation("customer"), false);

    assert.strictEqual(
      obligations.unpaidObligationStillEnforceable({ status: "IN_PROGRESS", paymentProgress: "FIRST_PAID" }),
      true
    );
    assert.strictEqual(
      obligations.unpaidObligationStillEnforceable({ status: "COMPLETED", paymentProgress: "FIRST_PAID" }),
      true
    );
    assert.strictEqual(
      obligations.unpaidObligationStillEnforceable({ status: "COMPLETED", paymentProgress: "FULLY_PAID" }),
      false
    );
    assert.strictEqual(
      obligations.unpaidObligationStillEnforceable({ status: "CANCELLED", paymentProgress: "NONE" }),
      false
    );
  } finally {
    originals.reverse().forEach((restore) => restore());
    await prisma.$disconnect();
  }
  console.log("jobStatusTerminalGuard.test.js passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
