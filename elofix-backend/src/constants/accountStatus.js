/** Logical account statuses used for auth revalidation (maps to User / Provider DB fields). */
const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  DEACTIVATED: "DEACTIVATED",
  DELETED: "DELETED",
});

const INACTIVE_STATUSES = new Set([
  ACCOUNT_STATUS.SUSPENDED,
  ACCOUNT_STATUS.BANNED,
  ACCOUNT_STATUS.DEACTIVATED,
  ACCOUNT_STATUS.DELETED,
]);

module.exports = { ACCOUNT_STATUS, INACTIVE_STATUSES };
