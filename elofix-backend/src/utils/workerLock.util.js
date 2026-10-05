/** Hold a session lock on a dedicated connection, without a transaction timeout. */
async function withAdvisoryLock(lockKey, fn, pool) {
  if (!pool) {
    require("../config/prisma"); // Initializes the application's pg pool.
    pool = globalThis.__elofixPgPool;
  }
  const client = await pool.connect();
  let locked = false;
  let destroy = false;
  let failure;
  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock($1::bigint) AS locked",
      [lockKey]
    );
    locked = rows?.[0]?.locked === true || rows?.[0]?.locked === "t";
    if (!locked) return { locked: false, result: null };
    return { locked: true, result: await fn() };
  } catch (err) {
    failure = err;
    // Acquisition can fail after the server has taken the lock.
    if (!locked) destroy = true;
    throw err;
  } finally {
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]);
      }
    } catch (err) {
      destroy = true; // Never return a possibly locked session to the pool.
      if (!failure) throw err;
    } finally {
      client.release(destroy);
    }
  }
}

module.exports = { withAdvisoryLock };
