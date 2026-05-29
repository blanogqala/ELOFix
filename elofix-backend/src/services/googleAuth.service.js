const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const authService = require("./auth.service");
const { validateLegalAcceptance, truthy } = require("./legalAcceptance.service");

const OAUTH_STATE_TTL = "10m";
const EXCHANGE_TOKEN_TTL = "5m";
const GOOGLE_SCOPES = ["openid", "email", "profile"];

function assertGoogleConfigured() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new AppError("Google sign-in is not configured on the server", 503);
  }
  if (!process.env.JWT_SECRET) {
    throw new AppError("Authentication is not configured on the server", 503);
  }
}

function getCallbackUrl() {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL.replace(/\/$/, "");
  }
  const apiBase = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`).replace(
    /\/$/,
    ""
  );
  return `${apiBase}/auth/google/callback`;
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
}

function createOAuthClient() {
  assertGoogleConfigured();
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getCallbackUrl()
  );
}

function parseGoogleRole(role) {
  const normalized = String(role || "CUSTOMER").toUpperCase();
  if (normalized === "PROVIDER") return "PROVIDER";
  if (normalized === "CUSTOMER") return "CUSTOMER";
  throw new AppError("Invalid role for Google sign-up", 400);
}

function signOAuthState(payload) {
  return jwt.sign(
    {
      ...payload,
      nonce: crypto.randomBytes(16).toString("hex"),
    },
    process.env.JWT_SECRET,
    { expiresIn: OAUTH_STATE_TTL }
  );
}

function verifyOAuthState(state) {
  try {
    return jwt.verify(String(state), process.env.JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired Google sign-in session. Please try again.", 400);
  }
}

function signExchangeToken(userId) {
  return jwt.sign({ sub: userId, purpose: "google_oauth_exchange" }, process.env.JWT_SECRET, {
    expiresIn: EXCHANGE_TOKEN_TTL,
  });
}

function verifyExchangeToken(token) {
  try {
    const payload = jwt.verify(String(token), process.env.JWT_SECRET);
    if (payload.purpose !== "google_oauth_exchange" || !payload.sub) {
      throw new Error("invalid exchange token");
    }
    return payload;
  } catch {
    throw new AppError("Invalid or expired Google sign-in token. Please try again.", 400);
  }
}

function buildGoogleAuthUrl(query = {}) {
  const client = createOAuthClient();
  const role = parseGoogleRole(query.role);
  const mode = query.mode === "register" ? "register" : "login";
  const nextPath = query.next ? String(query.next) : "";

  const statePayload = { role, mode, next: nextPath };

  if (mode === "register") {
    statePayload.legal = {
      acceptedTerms: truthy(query.acceptedTerms),
      acceptedPrivacy: truthy(query.acceptedPrivacy),
      acceptedProviderAgreement: truthy(query.acceptedProviderAgreement),
      acceptedRefundPolicy: truthy(query.acceptedRefundPolicy),
      termsVersion: query.termsVersion ? String(query.termsVersion) : "",
      privacyVersion: query.privacyVersion ? String(query.privacyVersion) : "",
      providerAgreementVersion: query.providerAgreementVersion
        ? String(query.providerAgreementVersion)
        : "",
      refundPolicyVersion: query.refundPolicyVersion ? String(query.refundPolicyVersion) : "",
    };
  }

  const state = signOAuthState(statePayload);

  return client.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: GOOGLE_SCOPES,
    state,
  });
}

function getOAuthErrorMessage(err, fallback = "Google sign-in failed") {
  if (err instanceof AppError) {
    return err.message;
  }

  const googleDescription = err?.response?.data?.error_description;
  if (googleDescription) {
    return String(googleDescription);
  }

  const googleError = err?.response?.data?.error;
  if (googleError === "invalid_client") {
    return "Google OAuth client secret is invalid. Update GOOGLE_CLIENT_SECRET in elofix-backend/.env and restart the server.";
  }
  if (googleError === "redirect_uri_mismatch") {
    return "Google OAuth redirect URI mismatch. Set GOOGLE_CALLBACK_URL to http://localhost:5000/api/auth/google/callback and add the same URI in Google Cloud Console.";
  }

  if (err?.message) {
    return String(err.message);
  }

  return fallback;
}

async function fetchGoogleProfile(code) {
  const client = createOAuthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(String(code)));
  } catch (err) {
    console.error("[googleAuth] token exchange failed:", getOAuthErrorMessage(err));
    throw new AppError(getOAuthErrorMessage(err), 502);
  }
  if (!tokens.id_token) {
    throw new AppError("Google did not return an identity token", 502);
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) {
    throw new AppError("Google account email is not verified", 403);
  }

  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase().trim(),
    name: payload.name?.trim() || payload.email.split("@")[0],
    profileImage: payload.picture || null,
  };
}

async function findOrCreateGoogleUser(profile, statePayload = {}) {
  const email = profile.email;
  const roleToUse = parseGoogleRole(statePayload.role);
  const mode = statePayload.mode === "register" ? "register" : "login";

  let user = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
    select: { ...authService.userPublicSelect, googleId: true },
  });

  if (user) {
    const updates = {};
    if (!user.profileImage && profile.profileImage) updates.profileImage = profile.profileImage;
    if (user.authProvider === "GOOGLE") {
      if (profile.profileImage && user.profileImage !== profile.profileImage) {
        updates.profileImage = profile.profileImage;
      }
    }

    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updates,
        select: authService.userPublicSelect,
      });
    }

    return { user, isNewUser: false };
  }

  const existingEmailUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, googleId: true },
  });
  if (existingEmailUser) {
    throw new AppError(
      "An account with this email already exists. Sign in with your password before connecting Google.",
      409
    );
  }

  if (mode !== "register") {
    throw new AppError("No account exists for this Google email. Please create an account first.", 404);
  }

  let legalData = {};
  legalData = validateLegalAcceptance(statePayload.legal || {}, roleToUse);

  try {
    user = await prisma.user.create({
      data: {
        email,
        googleId: profile.googleId,
        name: profile.name,
        profileImage: profile.profileImage,
        authProvider: "GOOGLE",
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
      select: authService.userPublicSelect,
    });
    return { user, isNewUser: true };
  } catch (err) {
    if (err.code === "P2002") {
      user = await prisma.user.findUnique({
        where: { googleId: profile.googleId },
        select: authService.userPublicSelect,
      });
      if (user) {
        return { user, isNewUser: false };
      }
      throw new AppError(
        "An account with this email already exists. Sign in with your password before connecting Google.",
        409
      );
    }
    throw err;
  }
}

function buildFrontendRedirect({ exchangeToken, error, errorDescription }) {
  const base = `${getFrontendUrl()}/auth/google/callback`;
  if (error) {
    const params = new URLSearchParams({
      error: String(error),
      ...(errorDescription ? { error_description: String(errorDescription) } : {}),
    });
    return `${base}?${params.toString()}`;
  }
  const params = new URLSearchParams({ exchange: exchangeToken });
  return `${base}?${params.toString()}`;
}

async function handleGoogleCallback(query = {}) {
  if (query.error) {
    return buildFrontendRedirect({
      error: query.error,
      errorDescription: query.error_description || "Google sign-in was cancelled",
    });
  }

  const { code, state } = query;
  if (!code || !state) {
    return buildFrontendRedirect({
      error: "invalid_request",
      errorDescription: "Missing Google authorization response",
    });
  }

  try {
    const statePayload = verifyOAuthState(state);
    const profile = await fetchGoogleProfile(code);
    const { user } = await findOrCreateGoogleUser(profile, statePayload);
    const exchangeToken = signExchangeToken(user.id);

    const params = new URLSearchParams({ exchange: exchangeToken });
    if (statePayload.next) params.set("next", statePayload.next);
    if (statePayload.mode) params.set("mode", statePayload.mode);

    return `${getFrontendUrl()}/auth/google/callback?${params.toString()}`;
  } catch (err) {
    const message = getOAuthErrorMessage(err);
    console.error("[googleAuth] callback failed:", message, err?.response?.data || "");
    return buildFrontendRedirect({
      error: "oauth_failed",
      errorDescription: message,
    });
  }
}

async function exchangeGoogleSession(exchangeToken) {
  const payload = verifyExchangeToken(exchangeToken);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: authService.userPublicSelect,
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const token = authService.signToken(user);
  return { user, token };
}

module.exports = {
  buildGoogleAuthUrl,
  handleGoogleCallback,
  exchangeGoogleSession,
  getCallbackUrl,
  getFrontendUrl,
  _private: {
    findOrCreateGoogleUser,
  },
};
