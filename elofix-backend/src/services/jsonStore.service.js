const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "app-state.json");

const DEFAULT_STATE = {
  jobsMeta: {},
  cardsByUser: {},
  invoices: [],
  suppliers: [],
  materialOrders: [],
  notificationsByUser: {},
  specials: [],
  deliveryProviders: [],
  filesById: {},
};

let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
  }
}

async function readState() {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return { ...DEFAULT_STATE, ...parsed };
}

function queueWrite(nextState) {
  const payload = JSON.stringify(nextState, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmpFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmpFile, payload, "utf8");
    await fs.rename(tmpFile, DATA_FILE);
  });
  return writeQueue;
}

async function updateState(mutator) {
  const state = await readState();
  const nextState = (await mutator(state)) || state;
  await queueWrite(nextState);
  return nextState;
}

module.exports = {
  readState,
  updateState,
};
