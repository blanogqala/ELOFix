const fs = require("fs/promises");
const { createReadStream } = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

let cachedClient = null;
/** @type {Map<string, { body: Buffer, contentType: string }> | null} */
let testMemoryStore = null;

function env(name) {
  return String(process.env[name] || "").trim();
}

function setTestMemoryStore(store) {
  testMemoryStore = store || null;
  cachedClient = null;
}

function credentialsPresent(envObj = process.env) {
  return Boolean(
    String(envObj.S3_BUCKET || "").trim() &&
      String(envObj.S3_ACCESS_KEY_ID || "").trim() &&
      String(envObj.S3_SECRET_ACCESS_KEY || "").trim()
  );
}

function isEnabled(envObj = process.env) {
  if (testMemoryStore) return true;
  return credentialsPresent(envObj);
}

function allowLocalOnlyUploads(envObj = process.env) {
  return String(envObj.ELOFIX_ALLOW_LOCAL_UPLOADS || "").toLowerCase() === "true";
}

/**
 * Production/staging with ephemeral disk must use object storage unless an operator
 * explicitly opts into local-only uploads (persistent disk).
 */
function isDurableStorageRequired(envObj = process.env) {
  if (String(envObj.NODE_ENV || "").toLowerCase() !== "production") return false;
  if (allowLocalOnlyUploads(envObj)) return false;
  return true;
}

function getDurableStorageReadiness(envObj = process.env) {
  if (!isDurableStorageRequired(envObj)) {
    return { ok: true, storage: "ok" };
  }
  if (!isEnabled(envObj)) {
    return { ok: false, storage: "invalid" };
  }
  return { ok: true, storage: "ok" };
}

function getClient() {
  if (testMemoryStore) return null;
  if (!isEnabled()) return null;
  if (cachedClient) return cachedClient;

  const endpoint = env("S3_ENDPOINT");
  cachedClient = new S3Client({
    region: env("S3_REGION") || "auto",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

function normalizeObjectKey(relPath) {
  return String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

async function putLocalFile(relPath, absolutePath, contentType) {
  const key = normalizeObjectKey(relPath);
  if (!key) return false;

  if (testMemoryStore) {
    const body = await fs.readFile(absolutePath);
    testMemoryStore.set(key, { body, contentType: contentType || "application/octet-stream" });
    return true;
  }

  const client = getClient();
  if (!client) return false;

  const body = await fs.readFile(absolutePath);
  await client.send(
    new PutObjectCommand({
      Bucket: env("S3_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    })
  );
  return true;
}

async function existsObject(relPath) {
  const key = normalizeObjectKey(relPath);
  if (!key) return false;

  if (testMemoryStore) {
    return testMemoryStore.has(key);
  }

  const client = getClient();
  if (!client) return false;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: env("S3_BUCKET"),
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function getObjectStream(relPath) {
  const key = normalizeObjectKey(relPath);
  if (!key) return null;

  if (testMemoryStore) {
    const rec = testMemoryStore.get(key);
    if (!rec) return null;
    return Readable.from(rec.body);
  }

  const client = getClient();
  if (!client) return null;

  const response = await client.send(
    new GetObjectCommand({
      Bucket: env("S3_BUCKET"),
      Key: key,
    })
  );

  if (!response.Body) return null;
  if (response.Body instanceof Readable) return response.Body;
  if (typeof response.Body.transformToWebStream === "function") {
    return Readable.fromWeb(response.Body.transformToWebStream());
  }
  return Readable.from(response.Body);
}

function publicUrlForKey(relPath) {
  const base = env("S3_PUBLIC_URL").replace(/\/$/, "");
  const key = normalizeObjectKey(relPath);
  if (!base || !key) return null;
  return `${base}/${key}`;
}

function inferMimeTypeFromPath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };
  return map[ext] || "application/octet-stream";
}

async function streamLocalOrRemote(relPath, absolutePath) {
  if (absolutePath && (await fileExists(absolutePath))) {
    return {
      stream: createReadStream(absolutePath),
      contentType: inferMimeTypeFromPath(absolutePath),
    };
  }
  if (!(await existsObject(relPath))) return null;
  const stream = await getObjectStream(relPath);
  if (!stream) return null;
  return {
    stream,
    contentType: inferMimeTypeFromPath(relPath),
  };
}

async function fileExists(absolutePath) {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

module.exports = {
  isEnabled,
  isDurableStorageRequired,
  getDurableStorageReadiness,
  setTestMemoryStore,
  putLocalFile,
  existsObject,
  getObjectStream,
  publicUrlForKey,
  streamLocalOrRemote,
};
