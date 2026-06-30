/**
 * Avatar URL helpers — preserve user-uploaded photos across Google re-login.
 */

function isGoogleHostedAvatarUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  return value.includes("googleusercontent.com");
}

function isPlatformHostedAvatarUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (value.startsWith("/api/files/")) return true;
  if (value.startsWith("/uploads/")) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Google OAuth may set or refresh the Google avatar on login, but must not
 * replace a custom platform upload (or other user-chosen external URL).
 */
function shouldSyncGoogleAvatarOnLogin(currentProfileImage) {
  const current = String(currentProfileImage || "").trim();
  if (!current) return true;
  if (isGoogleHostedAvatarUrl(current)) return true;
  if (isPlatformHostedAvatarUrl(current)) return false;
  if (current.startsWith("http://") || current.startsWith("https://")) return false;
  return false;
}

module.exports = {
  isGoogleHostedAvatarUrl,
  isPlatformHostedAvatarUrl,
  shouldSyncGoogleAvatarOnLogin,
};
