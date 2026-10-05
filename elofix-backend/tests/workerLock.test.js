const assert = require('assert');
const { withAdvisoryLock } = require('../src/utils/workerLock.util');
function fixture(locked = true) {
  const calls = [];
  const client = {
    async query(sql) { calls.push(sql); return { rows: [{ locked }] }; },
    release(destroy) { calls.push(['release', destroy]); },
  };
  return { calls, client, pool: { async connect() { return client; } } };
}
(async () => {
  const timeout = new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('acquisition hung')), 1000); t.unref(); });
  await assert.rejects(Promise.race([
    withAdvisoryLock(1, () => assert.fail('callback ran'), { connect: async () => { throw new Error('pool unavailable'); } }), timeout,
  ]), /pool unavailable/);
  const a = fixture();
  assert.deepStrictEqual(await withAdvisoryLock(1, async () => 42, a.pool), { locked: true, result: 42 });
  assert.match(a.calls[1], /pg_advisory_unlock/);
  assert.deepStrictEqual(a.calls[2], ['release', false]);
  const b = fixture(false);
  assert.deepStrictEqual(await withAdvisoryLock(1, () => assert.fail('contended callback ran'), b.pool), { locked: false, result: null });
  assert.strictEqual(b.calls.length, 2);
  const c = fixture();
  await assert.rejects(withAdvisoryLock(1, async () => { throw new Error('tick failed'); }, c.pool), /tick failed/);
  assert.match(c.calls[1], /unlock/);
  const d = fixture();
  d.client.query = async () => { throw new Error('acquire failed'); };
  await assert.rejects(withAdvisoryLock(1, () => assert.fail(), d.pool), /acquire failed/);
  assert.deepStrictEqual(d.calls, [['release', true]]);
  const e = fixture();
  e.client.query = async (sql) => { if (sql.includes('unlock')) throw new Error('unlock failed'); return {rows:[{locked:true}]}; };
  await assert.rejects(withAdvisoryLock(1, async () => 1, e.pool), /unlock failed/);
  assert.deepStrictEqual(e.calls, [['release', true]]);
  const f = fixture(); f.client.query = e.client.query;
  await assert.rejects(withAdvisoryLock(1, async () => { throw new Error('original tick failure'); }, f.pool), /original tick failure/);
  assert.deepStrictEqual(f.calls, [['release', true]]);
  console.log('workerLock.test.js passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
