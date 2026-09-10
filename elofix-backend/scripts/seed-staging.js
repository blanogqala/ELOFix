/**
 * Idempotent staging users: Customer A/B, Provider A (approved), Provider B (unapproved),
 * Supplier + main branch. Admin is created via prisma/seed.js (ADMIN_* env).
 *
 * Passwords come only from STAGING_SEED_PASSWORD (or per-account STAGING_*_PASSWORD).
 * This script never prints passwords.
 *
 * Run (from elofix-backend, against the staging DATABASE_URL):
 *   npm run prisma:seed-staging
 */
require("dotenv").config({ quiet: true });
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { LEGAL_VERSIONS } = require("../src/config/legalVersions");
const {
  resolveStagingSeedConfig,
  publicStagingAccountList,
} = require("../src/utils/stagingSeedConfig");

if (!process.env.DATABASE_URL) {
  console.error("seed-staging: DATABASE_URL is required");
  process.exit(1);
}

const prisma = require("../src/config/prisma");

function legalFields(role) {
  const now = new Date();
  const base = {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedRefundPolicy: true,
    acceptedAt: now,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
  };
  if (role === "PROVIDER") {
    return {
      ...base,
      acceptedProviderAgreement: true,
      providerAgreementVersion: LEGAL_VERSIONS.providerAgreement,
    };
  }
  if (role === "SUPPLIER") {
    return {
      ...base,
      acceptedSupplierAgreement: true,
      acceptedSupplierParticipationPolicy: true,
      supplierAgreementVersion: LEGAL_VERSIONS.supplierAgreement,
      supplierParticipationPolicyVersion: LEGAL_VERSIONS.supplierParticipation,
    };
  }
  return base;
}

async function upsertUser({ email, password, name, role, phone }) {
  const hashed = await bcrypt.hash(password, 12);
  const legal = legalFields(role);
  return prisma.user.upsert({
    where: { email },
    update: {
      password: hashed,
      name,
      phone,
      role,
      blocked: false,
      deletedAt: null,
      marketplaceRestricted: false,
      ...legal,
    },
    create: {
      email,
      password: hashed,
      name,
      phone,
      role,
      ...legal,
    },
  });
}

async function upsertApprovedProvider(user, { approved }) {
  await prisma.provider.upsert({
    where: { userId: user.id },
    update: {
      skills: ["plumbing"],
      location: "Cape Town",
      bio: approved
        ? "Approved staging plumbing provider for hosted marketplace validation."
        : "Unapproved staging provider — must not receive marketplace jobs until admin approval.",
      approved,
      profileCompleted: approved,
      blocked: false,
      businessName: approved ? "Staging Provider A Plumbing" : "Staging Provider B Plumbing",
      serviceAreas: ["Cape Town"],
      deletedAt: null,
      rejectionReason: null,
      rejectedAt: null,
      fraudReviewStatus: "NONE",
    },
    create: {
      userId: user.id,
      skills: ["plumbing"],
      location: "Cape Town",
      bio: approved
        ? "Approved staging plumbing provider for hosted marketplace validation."
        : "Unapproved staging provider — must not receive marketplace jobs until admin approval.",
      approved,
      profileCompleted: approved,
      businessName: approved ? "Staging Provider A Plumbing" : "Staging Provider B Plumbing",
      serviceAreas: ["Cape Town"],
    },
  });
}

async function upsertSupplier(user) {
  const existing = await prisma.supplier.findUnique({ where: { userId: user.id } });
  if (existing) {
    await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        name: "Staging Build Supply",
        businessName: "Staging Build Supply",
        brandName: "Staging Build Supply",
        branchName: "Bellville",
        city: "Cape Town",
        address: "1 Staging Road, Bellville, Cape Town",
        phone: user.phone,
        hasDelivery: true,
      },
    });
    const branchCount = await prisma.branch.count({ where: { supplierId: existing.id } });
    if (branchCount === 0) {
      await prisma.branch.create({
        data: {
          id: randomUUID(),
          supplierId: existing.id,
          name: "Bellville",
          address: "1 Staging Road, Bellville, Cape Town",
          city: "Cape Town",
          hasDelivery: true,
          products: [],
          isActive: true,
        },
      });
    }
    return existing;
  }

  const supplierId = randomUUID();
  await prisma.supplier.create({
    data: {
      id: supplierId,
      userId: user.id,
      name: "Staging Build Supply",
      businessName: "Staging Build Supply",
      brandName: "Staging Build Supply",
      branchName: "Bellville",
      city: "Cape Town",
      address: "1 Staging Road, Bellville, Cape Town",
      phone: user.phone,
      hasDelivery: true,
      deliveryFee: 0,
      products: [],
      createdByAdmin: true,
    },
  });
  await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId,
      name: "Bellville",
      address: "1 Staging Road, Bellville, Cape Town",
      city: "Cape Town",
      hasDelivery: true,
      products: [],
      isActive: true,
    },
  });
  return { id: supplierId };
}

async function main() {
  const config = resolveStagingSeedConfig({ nodeEnv: process.env.NODE_ENV, env: process.env });
  const { accounts } = config;

  const customerA = await upsertUser({
    ...accounts.customerA,
    phone: "0810000001",
  });
  const customerB = await upsertUser({
    ...accounts.customerB,
    phone: "0810000002",
  });
  const providerAUser = await upsertUser({
    ...accounts.providerA,
    phone: "0820000001",
  });
  const providerBUser = await upsertUser({
    ...accounts.providerB,
    phone: "0820000002",
  });
  const supplierUser = await upsertUser({
    ...accounts.supplier,
    phone: "0830000001",
  });

  await upsertApprovedProvider(providerAUser, { approved: true });
  await upsertApprovedProvider(providerBUser, { approved: false });
  await upsertSupplier(supplierUser);

  const publicAccounts = publicStagingAccountList(config);
  process.stderr.write("seed-staging: accounts ready (emails/roles only; passwords not printed)\n");
  for (const row of publicAccounts) {
    process.stderr.write(
      `  ${row.key}  role=${row.role}  email=${row.email}${row.approved === true ? "  approved=true" : row.approved === false ? "  approved=false" : ""}\n`
    );
  }
  process.stderr.write(
    `  ids customerA=${customerA.id} customerB=${customerB.id} providerA=${providerAUser.id} providerB=${providerBUser.id} supplier=${supplierUser.id}\n`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error && error.message ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
