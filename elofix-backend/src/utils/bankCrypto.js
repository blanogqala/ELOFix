const crypto = require("crypto");
const CryptoJS = require("crypto-js");

const PREFIX_V1 = "enc:v1:";
const PREFIX_V2 = "enc:v2:";
const ALGO = "aes-256-cbc";

function getSecret() {
  const k = process.env.SECRET_KEY;
  if (!k || String(k).length < 8) {
    throw new Error("SECRET_KEY must be set (min 8 chars) for bank field encryption");
  }
  return String(k);
}

function getKdfSalt() {
  const s = process.env.BANK_KDF_SALT;
  if (s && String(s).length >= 8) {
    return String(s);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BANK_KDF_SALT must be set (min 8 chars) for bank field encryption");
  }
  console.warn("[bankCrypto] BANK_KDF_SALT not set; using derived salt (development only)");
  const k = getSecret();
  return `dev:${k.slice(0, 48)}`;
}

function deriveKeyV2() {
  return crypto.scryptSync(getSecret(), getKdfSalt(), 32);
}

function encryptFieldV2(plain) {
  const text = String(plain ?? "");
  if (!text) return text;
  const key = deriveKeyV2();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return PREFIX_V2 + iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptFieldV2(stored) {
  const s = String(stored);
  const body = s.slice(PREFIX_V2.length);
  const [ivHex, cipherHex] = body.split(":");
  if (!ivHex || !cipherHex) {
    throw new Error("Invalid v2 ciphertext");
  }
  const key = deriveKeyV2();
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(cipherHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return out.toString("utf8");
}

function encryptFieldV1(plain) {
  const text = String(plain ?? "");
  if (!text) return text;
  return PREFIX_V1 + CryptoJS.AES.encrypt(text, getSecret()).toString();
}

function decryptFieldV1(stored) {
  const s = String(stored);
  const cipher = s.slice(PREFIX_V1.length);
  const bytes = CryptoJS.AES.decrypt(cipher, getSecret());
  const out = bytes.toString(CryptoJS.enc.Utf8);
  return out || s;
}

function encryptionVersion() {
  const raw = String(process.env.ENCRYPTION_VERSION || "v2").toLowerCase().trim();
  if (raw === "v1" || raw === "1") return "v1";
  return "v2";
}

function encryptField(plain) {
  if (encryptionVersion() === "v1") {
    return encryptFieldV1(plain);
  }
  return encryptFieldV2(plain);
}

/**
 * Decrypt stored bank field (supports enc:v1 and enc:v2).
 * @param {string|null|undefined} value
 */
function decrypt(value) {
  return decryptField(value);
}

/**
 * Returns plaintext for internal use only (e.g. re-save). Null if empty.
 */
function decryptField(stored) {
  if (stored == null || stored === "") return stored;
  const s = String(stored);
  if (s.startsWith(PREFIX_V2)) {
    try {
      return decryptFieldV2(s);
    } catch {
      return s;
    }
  }
  if (s.startsWith(PREFIX_V1)) {
    return decryptFieldV1(s);
  }
  return s;
}

function maskAccountNumber(plainOrStored) {
  const raw = decryptField(plainOrStored);
  const digits = String(raw || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `****${last4}` : "****";
}

function maskBranchCode(plainOrStored) {
  const raw = decryptField(plainOrStored);
  const t = String(raw || "").trim();
  if (t.length <= 2) return t ? "**" : "";
  return `${t[0]}${"*".repeat(Math.min(t.length - 2, 6))}${t[t.length - 1]}`;
}

function isEncryptedStored(value) {
  const s = String(value || "");
  return s.startsWith(PREFIX_V1) || s.startsWith(PREFIX_V2);
}

function toPublicProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.providerId,
    bankName: row.bankName,
    accountHolder: row.accountHolder,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    branchCodeMasked: maskBranchCode(row.branchCode),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

module.exports = {
  encryptField,
  decrypt,
  decryptField,
  maskAccountNumber,
  maskBranchCode,
  toPublicProfileRow,
  isEncryptedStored,
  PREFIX_V1,
  PREFIX_V2,
  /** @deprecated use isEncryptedStored */
  PREFIX: PREFIX_V1,
  encryptFieldV1,
  encryptFieldV2,
};
