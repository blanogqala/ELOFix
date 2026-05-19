const prisma = require("../config/prisma");

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailLike(value) {
  return EMAIL_LIKE.test(String(value || "").trim());
}

/**
 * Resolve a person's display name (full name from profile), never email.
 */
async function resolveUserDisplayName(userId) {
  if (!userId) return "User";
  const row = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { name: true },
  });
  const name = row?.name?.trim();
  if (name && !isEmailLike(name)) return name;
  return "User";
}

module.exports = {
  isEmailLike,
  resolveUserDisplayName,
};
