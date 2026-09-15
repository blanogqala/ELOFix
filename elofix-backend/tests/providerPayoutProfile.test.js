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

    const { Prisma } = require("@prisma/client");
    const payoutDestinationService = require("../src/services/payoutDestination.service");
    let deactivateCalls = 0;
    const origDeactivate = payoutDestinationService.deactivatePayoutDestination;
    payoutDestinationService.deactivatePayoutDestination = async (...args) => {
      deactivateCalls += 1;
      return origDeactivate(...args);
    };

    const inflightUser = await prisma.user.create({
      data: {
        email: `payout.inflight.${suffix}@example.com`,
        password: "x",
        name: "Inflight",
        role: "PROVIDER",
      },
    });
    const inflightProvider = await prisma.provider.create({
      data: {
        userId: inflightUser.id,
        businessName: `Inflight Biz ${suffix}`,
        approved: true,
        profileCompleted: true,
      },
    });
    const inflightCustomer = await prisma.user.create({
      data: {
        email: `payout.icust.${suffix}@example.com`,
        password: "x",
        name: "Customer",
        role: "CUSTOMER",
      },
    });
    const inflightJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Inflight",
        customerId: inflightCustomer.id,
        providerId: inflightUser.id,
        category: "tiling",
        description: "test",
        status: "ACCEPTED",
        price: new Prisma.Decimal("100.00"),
        measurements: {},
        materials: [],
        images: [],
      },
    });
    await prisma.providerWithdrawalProfile.create({
      data: {
        id: randomUUID(),
        providerId: inflightProvider.id,
        bankName: "FNB",
        accountHolder: "Inflight",
        accountNumber: "enc:test-2222222222",
        branchCode: "enc:test-250655",
        accountType: "CHEQUE",
        verificationStatus: "VERIFIED",
        gatewayProvider: "PAYSTACK",
        gatewayRecipientId: "ACCT_KEEP",
        gatewayProfileStatus: "ACTIVE",
        gatewayProfilePayload: { domain: "test", subaccount_code: "ACCT_KEEP" },
        isActive: true,
      },
    });

    async function seedInflightIntent(status) {
      return prisma.paymentIntent.create({
        data: {
          id: randomUUID(),
          merchantReference: `EF-IF-${status}-${suffix}`.toUpperCase(),
          provider: "PAYSTACK",
          kind: "LABOR",
          paymentType: "DEPOSIT",
          userId: inflightCustomer.id,
          jobId: inflightJob.id,
          recipientUserId: inflightUser.id,
          amount: new Prisma.Decimal("50.00"),
          commissionAmount: new Prisma.Decimal("3.50"),
          recipientAmount: new Prisma.Decimal("46.50"),
          currency: "ZAR",
          state: "PAID",
          paidAt: new Date(),
          providerPayoutStatus: "COMPLETE",
          payoutSettlementStatus: status,
          gatewayPayload: { subaccount: "ACCT_KEEP", bearer: "subaccount" },
        },
      });
    }

    const replaceBody = {
      confirmReplace: true,
      bankName: "ABSA",
      accountHolder: "Inflight",
      accountNumber: "5555555555",
      branchCode: "632005",
      accountType: "SAVINGS",
    };

    try {
      for (const status of ["PROCESSING", "PENDING", "FAILED"]) {
        const intent = await seedInflightIntent(status);
        deactivateCalls = 0;
        let blocked = false;
        try {
          await providerAccountService.replaceWithdrawalProfile(inflightUser.id, replaceBody);
        } catch (e) {
          blocked = e instanceof AppError && e.statusCode === 409;
          if (!blocked) throw e;
          if (!String(e.message).includes("Paystack payout is still processing")) {
            throw new Error(`unexpected 409 message: ${e.message}`);
          }
        }
        if (!blocked) throw new Error(`expected 409 for ${status}`);
        if (deactivateCalls !== 0) throw new Error(`gateway deactivation must not run for ${status}`);
        const kept = await prisma.providerWithdrawalProfile.findUnique({
          where: { providerId: inflightProvider.id },
        });
        if (kept.gatewayRecipientId !== "ACCT_KEEP") {
          throw new Error(`ACCT_ must remain for ${status}`);
        }
        if (kept.bankName !== "FNB") throw new Error(`bank profile must remain for ${status}`);
        await prisma.paymentIntent.delete({ where: { id: intent.id } });
      }

      const settledIntent = await seedInflightIntent("SETTLED");
      const settledReplace = await providerAccountService.replaceWithdrawalProfile(inflightUser.id, replaceBody);
      if (settledReplace.profile?.bankName !== "ABSA") {
        throw new Error("SETTLED payouts must allow bank replacement");
      }
      await prisma.paymentIntent.delete({ where: { id: settledIntent.id } }).catch(() => {});
    } finally {
      payoutDestinationService.deactivatePayoutDestination = origDeactivate;
      await prisma.paymentIntent.deleteMany({ where: { jobId: inflightJob.id } }).catch(() => {});
      await prisma.job.deleteMany({ where: { id: inflightJob.id } }).catch(() => {});
      await prisma.providerWithdrawalProfile.deleteMany({ where: { providerId: inflightProvider.id } }).catch(() => {});
      await prisma.provider.deleteMany({ where: { id: inflightProvider.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: [inflightUser.id, inflightCustomer.id] } } }).catch(() => {});
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
