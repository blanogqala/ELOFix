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

function isEnabled() {
  if (testMemoryStore) return true;
  return Boolean(env("S3_BUCKET") && env("S3_ACCESS_KEY_ID") && env("S3_SECRET_ACCESS_KEY"));
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
  setTestMemoryStore,
  putLocalFile,
  existsObject,
  getObjectStream,
  publicUrlForKey,
  streamLocalOrRemote,
};
