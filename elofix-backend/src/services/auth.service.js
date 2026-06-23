const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const providerService = require("./provider.service");
const supplierService = require("./supplier.service");
const branchUserService = require("./branchUser.service");
const { validateLegalAcceptance } = require("./legalAcceptance.service");
const fraudDetection = require("./fraudDetection.service");
const { normalizePhone } = require("../utils/phoneNormalization.util");

const VALID_ROLES = ["CUSTOMER", "PROVIDER", "ADMIN"];

const userPublicSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  profileImage: true,
  authProvider: true,
  role: true,
  blocked: true,
  deletedAt: true,
  createdAt: true,
};

function assertCustomerAccountActive(user) {
  if (user.role !== "CUSTOMER") return;
  if (user.deletedAt) {
    throw new AppError("This account has been removed", 403);
  }
  if (user.blocked) {
    throw new AppError("This account has been suspended. Contact support.", 403);
  }
}

function parseRole(role) {
  if (role == null || role === "") {
    return "CUSTOMER";
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AppError("Invalid role", 400);
  }
  if (role === "ADMIN") {
    // Admin users must be provisioned manually (DB or seed script), never via public registration.
    throw new AppError("Admin accounts cannot be created via public registration", 403);
  }
  if (role === "SUPPLIER") {
    throw new AppError("Supplier accounts cannot be created via public registration", 403);
  }
  return role;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function signBranchStaffToken(branchUser, supplierOrgId) {
  return jwt.sign(
    {
      sub: branchUser.id,
      email: branchUser.email,
      role: "BRANCH_STAFF",
      branchId: branchUser.branchId,
      supplierOrgId: String(supplierOrgId || ""),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

async function register(body) {
  const { email, password, name, role, phone } = body;

  if (!email || !password || !name) {
    throw new AppError("Email, password, and name are required");
  }

  const roleToUse = parseRole(role);
  const legalData = validateLegalAcceptance(body, roleToUse);
  const hashed = await bcrypt.hash(password, 12);
  const phoneNorm = phone != null && String(phone).trim() ? String(phone).trim() : null;
  const phoneNormalized = phoneNorm ? await fraudDetection.assertPhoneAvailable(phoneNorm, null, {}) : null;

  try {
    const existing = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      select: { id: true, authProvider: true },
    });
    if (existing?.authProvider === "GOOGLE") {
      throw new AppError("An account with this email already exists. Continue with Google instead.", 409);
    }

    const user = await prisma.user.create({
      data: {
        email: String(email).toLowerCase().trim(),
        password: hashed,
        name: String(name).trim(),
        phone: phoneNorm,
        phoneNormalized: phoneNormalized || (phoneNorm ? normalizePhone(phoneNorm) : null),
        authProvider: "LOCAL",
        role: roleToUse,
        ...legalData,
        ...(roleToUse === "PROVIDER"
          ? {
              providerProfile: {
                create: {
                  skills: [],
                  location: "UNKNOWN",
                  bio: "",
                  approved: false,
                  profileCompleted: false,
                },
              },
            }
          : {}),
      },
      select: { ...userPublicSelect, password: true },
    });

    const { password: _p, ...safe } = user;
    const token = signToken(user);

    return { user: safe, token };
  } catch (err) {
    if (err.code === "P2002") {
      if (String(err.meta?.target || "").includes("phoneNormalized")) {
        throw new AppError(fraudDetection.DUPLICATE_PHONE_MESSAGE, 409);
      }
      throw new AppError("Email already registered", 409);
    }
    throw err;
  }
}

async function login(body) {
  const { email, password } = body;

  if (!email || !password) {
    throw new AppError("Email and password are required");
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { ...userPublicSelect, password: true },
  });

  if (!user) {
    const branchUser = await prisma.branchUser.findUnique({
      where: { email: normalizedEmail },
      include: { branch: { select: { supplierId: true } } },
    });
    if (!branchUser) {
      throw new AppError("Invalid email or password", 401);
    }
    const matchBu = await bcrypt.compare(password, branchUser.password);
    if (!matchBu) {
      throw new AppError("Invalid email or password", 401);
    }
    const token = signBranchStaffToken(branchUser, branchUser.branch.supplierId);
    return {
      user: {
        id: branchUser.id,
        email: branchUser.email,
        name: branchUser.email,
        phone: null,
        role: "BRANCH_STAFF",
        createdAt: branchUser.createdAt,
        branchId: branchUser.branchId,
        supplierOrgId: branchUser.branch.supplierId,
        branchUserRole: branchUser.role,
      },
      token,
    };
  }

  if (!user.password) {
    throw new AppError("This account uses Google sign-in. Please continue with Google.", 401);
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new AppError("Invalid email or password", 401);
  }

  assertCustomerAccountActive(user);

  const { password: _p, ...safe } = user;
  const token = signToken(user);

  return { user: safe, token };
}

async function getMe(ctx) {
  if (ctx.role === "BRANCH_STAFF") {
    const bu = await prisma.branchUser.findUnique({
      where: { id: ctx.userId },
      include: { branch: { include: { supplier: true } } },
    });
    if (!bu) {
      throw new AppError("User not found", 404);
    }
    return {
      user: {
        id: bu.id,
        email: bu.email,
        name: bu.email,
        phone: null,
        role: "BRANCH_STAFF",
        createdAt: bu.createdAt,
        branchId: bu.branchId,
        supplierOrgId: bu.branch.supplierId,
        branchUserRole: bu.role,
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { ...userPublicSelect, password: true },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.role === "PROVIDER") {
    const profile = await providerService.getProviderByUserId(ctx.userId);
    return {
      user: {
        ...profile,
        role: "PROVIDER",
      },
    };
  }

  if (user.role === "SUPPLIER") {
    const supplier = await supplierService.getSupplierProfileByUserId(ctx.userId);
    const { password: _p2, ...base } = user;
    return {
      user: {
        ...base,
        role: "SUPPLIER",
        supplierProfile: supplier,
      },
    };
  }

  assertCustomerAccountActive(user);

  const { password: _p, ...safe } = user;
  return { user: safe };
}

async function changePassword(ctx, body = {}) {
  if (ctx.role === "BRANCH_STAFF") {
    return branchUserService.updateBranchStaffPassword(ctx.userId, body);
  }
  const currentPassword = body.currentPassword ?? body.oldPassword;
  const newPassword = body.newPassword ?? body.password;
  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required", 400);
  }
  if (String(newPassword).length < 8) {
    throw new AppError("New password must be at least 8 characters", 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { password: true },
  });
  if (!user?.password) {
    throw new AppError("This account uses Google sign-in and does not have a password set.", 400);
  }
  const ok = await bcrypt.compare(String(currentPassword), user.password);
  if (!ok) {
    throw new AppError("Current password is incorrect", 401);
  }
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { password: await bcrypt.hash(String(newPassword), 12) },
  });
  return true;
}

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  signToken,
  userPublicSelect,
  assertCustomerAccountActive,
};
