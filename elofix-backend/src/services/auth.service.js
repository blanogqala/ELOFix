const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const providerService = require("./provider.service");

const VALID_ROLES = ["CUSTOMER", "PROVIDER", "ADMIN"];

const userPublicSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  createdAt: true,
};

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
  return role;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
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
  const hashed = await bcrypt.hash(password, 12);
  const phoneNorm = phone != null && String(phone).trim() ? String(phone).trim() : null;

  try {
    const user = await prisma.user.create({
      data: {
        email: String(email).toLowerCase().trim(),
        password: hashed,
        name: String(name).trim(),
        phone: phoneNorm,
        role: roleToUse,
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

  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    select: { ...userPublicSelect, password: true },
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new AppError("Invalid email or password", 401);
  }

  const { password: _p, ...safe } = user;
  const token = signToken(user);

  return { user: safe, token };
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...userPublicSelect, password: true },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.role === "PROVIDER") {
    const profile = await providerService.getProviderByUserId(userId);
    return {
      user: {
        ...profile,
        role: "PROVIDER",
      },
    };
  }

  const { password: _p, ...safe } = user;
  return { user: safe };
}

module.exports = {
  register,
  login,
  getMe,
};
