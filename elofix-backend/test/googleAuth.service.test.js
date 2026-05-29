const assert = require("node:assert/strict");
const test = require("node:test");

function loadGoogleAuthService(prisma) {
  globalThis.prisma = prisma;

  for (const modulePath of ["../src/services/auth.service", "../src/services/googleAuth.service"]) {
    delete require.cache[require.resolve(modulePath)];
  }
  const prismaPath = require.resolve("../src/config/prisma");
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };

  return require("../src/services/googleAuth.service");
}

const profile = {
  googleId: "google-sub-123",
  email: "victim@example.com",
  name: "Victim User",
  profileImage: null,
};

test("Google OAuth does not auto-link to an existing password account by email", async () => {
  const calls = { create: 0, update: 0 };
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.googleId) return null;
        if (where.email === profile.email) return { id: "local-user-id", googleId: null };
        return null;
      },
      create: async () => {
        calls.create += 1;
        throw new Error("create should not be called");
      },
      update: async () => {
        calls.update += 1;
        throw new Error("update should not be called");
      },
    },
  };

  const { _private } = loadGoogleAuthService(prisma);

  await assert.rejects(
    () => _private.findOrCreateGoogleUser(profile, { mode: "login", role: "CUSTOMER" }),
    (err) => err.statusCode === 409 && /already exists/i.test(err.message)
  );
  assert.equal(calls.create, 0);
  assert.equal(calls.update, 0);
});

test("Google login mode cannot silently create a new account", async () => {
  const prisma = {
    user: {
      findUnique: async () => null,
      create: async () => {
        throw new Error("create should not be called");
      },
    },
  };

  const { _private } = loadGoogleAuthService(prisma);

  await assert.rejects(
    () => _private.findOrCreateGoogleUser(profile, { mode: "login", role: "CUSTOMER" }),
    (err) => err.statusCode === 404 && /create an account first/i.test(err.message)
  );
});

test("Google register mode creates a new account after legal acceptance", async () => {
  let createdData;
  const prisma = {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => {
        createdData = data;
        return {
          id: "new-google-user-id",
          email: data.email,
          name: data.name,
          phone: null,
          profileImage: data.profileImage,
          authProvider: data.authProvider,
          role: data.role,
          createdAt: new Date("2026-05-29T00:00:00.000Z"),
        };
      },
    },
  };

  const { _private } = loadGoogleAuthService(prisma);

  const result = await _private.findOrCreateGoogleUser(profile, {
    mode: "register",
    role: "CUSTOMER",
    legal: {
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsVersion: "2026-05-01",
      privacyVersion: "2026-05-01",
    },
  });

  assert.equal(result.isNewUser, true);
  assert.equal(result.user.authProvider, "GOOGLE");
  assert.equal(createdData.email, profile.email);
  assert.equal(createdData.googleId, profile.googleId);
  assert.equal(createdData.acceptedTerms, true);
  assert.equal(createdData.acceptedPrivacy, true);
});
