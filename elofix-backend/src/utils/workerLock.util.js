const prisma = require("../config/prisma");

function isLocked(value) {
  return value === true || value === "t";
}

/**
 * Hold a session advisory lock on one pooled connection for the whole tick.
 * Unlock runs on that same connection. A second process sees try_lock = false.
 * @param {number} lockKey
 * @param {() => Promise<any>} fn
 */
async function withAdvisoryLock(lockKey, fn) {
  let releaseHold;
  const hold = new Promise((resolve) => {
    releaseHold = resolve;
  });
  let report;
  const reported = new Promise((resolve) => {
    report = resolve;
  });

  const txPromise = prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRawUnsafe(
        "SELECT pg_try_advisory_lock($1::bigint) AS locked",
        lockKey
      );
      const locked = isLocked(rows?.[0]?.locked);
      report(locked);
      if (!locked) return;
      await hold;
      await tx.$queryRawUnsafe("SELECT pg_advisory_unlock($1::bigint)", lockKey);
    },
    { maxWait: 10000, timeout: 180000 }
  );

  const locked = await reported;
  if (!locked) {
    await txPromise;
    return { locked: false, result: null };
  }

  try {
    const result = await fn();
    return { locked: true, result };
  } finally {
    releaseHold();
    await txPromise;
  }
}

module.exports = {
  withAdvisoryLock,
};
