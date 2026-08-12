const { Prisma } = require("@prisma/client");

/**
 * Platform commission rate (default 7%). Overridable via PLATFORM_COMMISSION_RATE.
 * @returns {number} rate in [0, 1]
 */
function getPlatformCommissionRate() {
  const raw = process.env.PLATFORM_COMMISSION_RATE;
  if (raw == null || String(raw).trim() === "") return 0.07;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0.07;
  return n;
}

/**
 * Convert major currency units (ZAR) to integer cents.
 * @param {number|string|Prisma.Decimal} amount
 * @returns {number}
 */
function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Convert integer cents to major units (2dp number).
 * @param {number} cents
 * @returns {number}
 */
function fromCents(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

/**
 * Split gross amount into platform commission + recipient share using integer cents.
 * Commission is calculated on THIS transaction only (never on full quote when paying a tranche).
 *
 * @param {number|string|Prisma.Decimal} grossMajor
 * @param {number} [rate]
 * @returns {{ grossCents: number, commissionCents: number, recipientCents: number, commissionAmount: Prisma.Decimal, recipientAmount: Prisma.Decimal, grossAmount: Prisma.Decimal }}
 */
function splitCommission(grossMajor, rate = getPlatformCommissionRate()) {
  const grossCents = toCents(grossMajor);
  if (grossCents <= 0) {
    const zero = new Prisma.Decimal(0);
    return {
      grossCents: 0,
      commissionCents: 0,
      recipientCents: 0,
      commissionAmount: zero,
      recipientAmount: zero,
      grossAmount: zero,
    };
  }
  const commissionCents = Math.round(grossCents * rate);
  const recipientCents = grossCents - commissionCents;
  return {
    grossCents,
    commissionCents,
    recipientCents,
    commissionAmount: new Prisma.Decimal(fromCents(commissionCents).toFixed(2)),
    recipientAmount: new Prisma.Decimal(fromCents(recipientCents).toFixed(2)),
    grossAmount: new Prisma.Decimal(fromCents(grossCents).toFixed(2)),
  };
}

/**
 * Split a quoted gross into 50/50 customer payment schedule (cents-safe).
 * @param {number|string|Prisma.Decimal} quotedMajor
 * @returns {{ quotedAmount: Prisma.Decimal, firstPaymentAmount: Prisma.Decimal, secondPaymentAmount: Prisma.Decimal }}
 */
function splitFiftyFiftySchedule(quotedMajor) {
  const totalCents = toCents(quotedMajor);
  const firstCents = Math.floor(totalCents / 2);
  const secondCents = totalCents - firstCents;
  return {
    quotedAmount: new Prisma.Decimal(fromCents(totalCents).toFixed(2)),
    firstPaymentAmount: new Prisma.Decimal(fromCents(firstCents).toFixed(2)),
    secondPaymentAmount: new Prisma.Decimal(fromCents(secondCents).toFixed(2)),
  };
}

module.exports = {
  getPlatformCommissionRate,
  toCents,
  fromCents,
  splitCommission,
  splitFiftyFiftySchedule,
};
