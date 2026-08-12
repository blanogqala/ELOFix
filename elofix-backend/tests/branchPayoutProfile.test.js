/**
 * Branch payout profile — MANAGER-only PUT, masking, cross-branch isolation.
 * Run: node tests/branchPayoutProfile.test.js
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const branchAccountService = require("../src/services/branchAccount.service");
const AppError = require("../src/utils/AppError");

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const supplierUser = await prisma.user.create({
    data: {
      email: `branch.payout.sup.${suffix}@example.com`,
      password: "x",
      name: "Supplier Owner",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: supplierUser.id,
      name: `Supplier ${suffix}`,
      businessName: `Biz ${suffix}`,
    },
  });

  const branchA = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `Branch A ${suffix}`,
      address: "1 Test St",
      products: [],
    },
  });
  const branchB = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `Branch B ${suffix}`,
      address: "2 Test St",
      products: [],
    },
  });

  const manager = await prisma.branchUser.create({
    data: {
      id: randomUUID(),
      branchId: branchA.id,
      email: `manager.${suffix}@example.com`,
      password: "x",
      role: "MANAGER",
    },
  });
  const staff = await prisma.branchUser.create({
    data: {
      id: randomUUID(),
      branchId: branchA.id,
      email: `staff.${suffix}@example.com`,
      password: "x",
      role: "STAFF",
    },
  });

  const managerReq = {
    userId: manager.id,
    role: "BRANCH_STAFF",
    branchId: branchA.id,
    supplierOrgId: supplier.id,
  };
  const staffReq = {
    userId: staff.id,
    role: "BRANCH_STAFF",
    branchId: branchA.id,
    supplierOrgId: supplier.id,
  };
  const supplierReq = {
    userId: supplierUser.id,
    role: "SUPPLIER",
  };

  try {
    const empty = await branchAccountService.getWithdrawalProfile(supplierReq, branchA.id);
    if (empty.verificationStatus !== "NOT_CONFIGURED") {
      throw new Error(`expected NOT_CONFIGURED, got ${empty.verificationStatus}`);
    }

    let staffBlocked = false;
    try {
      await branchAccountService.upsertWithdrawalProfile(staffReq, branchA.id, {
        bankName: "FNB",
        accountHolder: "Branch A",
        accountNumber: "1234567890",
        branchCode: "250655",
        accountType: "CHEQUE",
      });
    } catch (e) {
      staffBlocked = e instanceof AppError && e.statusCode === 403;
    }
    if (!staffBlocked) throw new Error("STAFF must not update bank details");

    const saved = await branchAccountService.upsertWithdrawalProfile(managerReq, branchA.id, {
      bankName: "FNB",
      accountHolder: "Branch A",
      accountNumber: "1234567890",
      branchCode: "250655",
      accountType: "CHEQUE",
    });
    if (!saved.profile) throw new Error("expected profile");
    if (String(saved.profile.accountNumberMasked).includes("1234567890")) {
      throw new Error("raw account leaked");
    }
    if (saved.verificationStatus !== "PENDING_VERIFICATION") {
      throw new Error(`expected PENDING_VERIFICATION, got ${saved.verificationStatus}`);
    }

    const completed = await branchAccountService.getWithdrawalProfile(managerReq, branchA.id);
    if (!completed.bankProfileComplete) throw new Error("bankProfileComplete should be true");
    if (completed.verificationStatus === "NOT_CONFIGURED") {
      throw new Error("completed profile should not be NOT_CONFIGURED");
    }
    if (typeof completed.canRemove !== "boolean") throw new Error("canRemove should be boolean");

    const replaced = await branchAccountService.replaceWithdrawalProfile(managerReq, branchA.id, {
      confirmReplace: true,
      bankName: "ABSA",
      accountHolder: "Branch A",
      accountNumber: "9876543210",
      branchCode: "632005",
      accountType: "SAVINGS",
    });
    if (replaced.profile?.bankName !== "ABSA") throw new Error("replace failed");
    if (replaced.verificationStatus !== "PENDING_VERIFICATION") {
      throw new Error("replace should stay pending verification");
    }

    const removed = await branchAccountService.deactivateWithdrawalProfile(managerReq, branchA.id);
    if (removed.profile !== null) throw new Error("expected null after deactivate");

    let crossBranch = false;
    try {
      await branchAccountService.getWithdrawalProfile(managerReq, branchB.id);
    } catch (e) {
      crossBranch = e instanceof AppError && e.statusCode === 403;
    }
    if (!crossBranch) throw new Error("manager must not access other branch profile");

    let withdrawBlocked = false;
    try {
      await branchAccountService.requestWithdrawal(managerReq, branchA.id);
    } catch (e) {
      withdrawBlocked = e instanceof AppError && e.statusCode === 410;
    }
    if (!withdrawBlocked) throw new Error("manual withdrawal must return 410");

    const summary = await branchAccountService.getBranchBalance(supplierReq, branchA.id);
    if (typeof summary.pendingSettlement !== "number" || typeof summary.settled !== "number") {
      throw new Error("balance endpoint must return settlement summary fields");
    }
    if ("available" in summary) throw new Error("available withdrawal field must be removed");

    console.log("branchPayoutProfile.test.js: OK");
  } finally {
    await prisma.branchWithdrawalProfile.deleteMany({ where: { branchId: { in: [branchA.id, branchB.id] } } });
    await prisma.branchUser.deleteMany({ where: { id: { in: [manager.id, staff.id] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } });
    await prisma.supplier.delete({ where: { id: supplier.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: supplierUser.id } }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
