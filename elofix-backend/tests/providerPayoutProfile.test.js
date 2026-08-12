/**
 * Provider payout profile — no auto-VERIFIED, replace, delete guards.
 * Run: node tests/providerPayoutProfile.test.js
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const providerAccountService = require("../src/services/providerAccount.service");
const AppError = require("../src/utils/AppError");

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `payout.prov.${suffix}@example.com`,
      password: "x",
      name: "Payout Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: user.id,
      businessName: `Payout Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });

  const otherUser = await prisma.user.create({
    data: {
      email: `payout.other.${suffix}@example.com`,
      password: "x",
      name: "Other",
      role: "PROVIDER",
    },
  });
  await prisma.provider.create({
    data: {
      userId: otherUser.id,
      businessName: `Other Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });

  try {
    const empty = await providerAccountService.getWithdrawalProfile(user.id);
    if (empty.profile !== null) throw new Error("expected null profile when not configured");
    if (empty.verificationStatus !== "NOT_CONFIGURED") {
      throw new Error(`expected NOT_CONFIGURED, got ${empty.verificationStatus}`);
    }

    try {
      await providerAccountService.upsertWithdrawalProfile(user.id, {
        bankName: "FNB",
        accountHolder: "Payout Provider",
        accountNumber: "1234567890",
        branchCode: "250655",
      });
      throw new Error("expected accountType required on create");
    } catch (e) {
      if (!(e instanceof AppError) || e.statusCode !== 400) throw e;
    }

    const saved = await providerAccountService.upsertWithdrawalProfile(user.id, {
      bankName: "FNB",
      accountHolder: "Payout Provider",
      accountNumber: "1234567890",
      branchCode: "250655",
      accountType: "CHEQUE",
    });
    if (!saved.profile) throw new Error("expected profile");
    if (saved.profile.accountNumberMasked.includes("1234567890")) {
      throw new Error("raw account number leaked in response");
    }
    if (saved.verificationStatus !== "PENDING_VERIFICATION") {
      throw new Error(`expected PENDING_VERIFICATION, got ${saved.verificationStatus}`);
    }
    if (saved.gatewaySettlementSupported !== false && saved.gatewaySettlementSupported !== true) {
      throw new Error("gatewaySettlementSupported should be boolean");
    }

    const noopEdit = await providerAccountService.upsertWithdrawalProfile(user.id, {
      bankName: "FNB",
      accountHolder: "Payout Provider",
      accountType: "CHEQUE",
    });
    if (noopEdit.verificationStatus !== "PENDING_VERIFICATION") {
      throw new Error("noop edit should keep pending verification");
    }

    const replaced = await providerAccountService.replaceWithdrawalProfile(user.id, {
      confirmReplace: true,
      bankName: "ABSA",
      accountHolder: "Payout Provider",
      accountNumber: "9876543210",
      branchCode: "632005",
      accountType: "SAVINGS",
    });
    if (replaced.profile?.bankName !== "ABSA") throw new Error("replace should update bank name");
    if (replaced.verificationStatus !== "PENDING_VERIFICATION") {
      throw new Error("replace should reset to pending verification");
    }

    const removed = await providerAccountService.deactivateWithdrawalProfile(user.id);
    if (removed.profile !== null) throw new Error("expected null profile after deactivate");
    if (removed.verificationStatus !== "NOT_CONFIGURED") {
      throw new Error(`expected NOT_CONFIGURED after deactivate, got ${removed.verificationStatus}`);
    }

    const other = await providerAccountService.getWithdrawalProfile(otherUser.id);
    if (other.profile) throw new Error("other provider must not see first provider bank profile");

    try {
      await providerAccountService.requestWithdrawal(user.id, { amount: 100 }, null, null, "/");
      throw new Error("withdrawal should stay disabled");
    } catch (e) {
      if (!(e instanceof AppError) || e.statusCode !== 410) throw e;
    }

    console.log("providerPayoutProfile.test.js: OK");
  } finally {
    await prisma.providerWithdrawalProfile.deleteMany({ where: { providerId: provider.id } }).catch(() => {});
    await prisma.provider.deleteMany({
      where: { user: { email: { contains: `payout.${suffix}` } } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { email: { contains: `payout.${suffix}` } },
    }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
