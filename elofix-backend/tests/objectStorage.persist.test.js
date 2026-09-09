/**
 * Persistent object storage: upload → remote store → retrieve after local delete.
 * Run: node tests/objectStorage.persist.test.js
 */
require("dotenv").config();
const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const objectStorage = require("../src/services/objectStorage.service");

async function run() {
  const store = new Map();
  objectStorage.setTestMemoryStore(store);
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "elofix-obj-"));
    const abs = path.join(dir, "completion.jpg");
    const payload = Buffer.from("remote-persist-bytes");
    await fs.writeFile(abs, payload);
    const rel = "jobs/job-persist/completion/images/completion.jpg";

    const put = await objectStorage.putLocalFile(rel, abs, "image/jpeg");
    assert.strictEqual(put, true);
    assert.strictEqual(store.has(rel), true);

    await fs.unlink(abs);
    const exists = await objectStorage.existsObject(rel);
    assert.strictEqual(exists, true);

    const streamed = await objectStorage.streamLocalOrRemote(rel, abs);
    assert.ok(streamed, "must retrieve remote object after local delete");
    const chunks = [];
    for await (const chunk of streamed.stream) chunks.push(chunk);
    const got = Buffer.concat(chunks);
    assert.strictEqual(got.toString(), payload.toString());
  } finally {
    objectStorage.setTestMemoryStore(null);
  }
  console.log("objectStorage.persist.test.js: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
