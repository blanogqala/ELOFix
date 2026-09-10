/**
 * Small IPv4 CIDR matcher. No third-party IP library is in this repo.
 * Handles IPv4 and IPv4-mapped IPv6 (::ffff:a.b.c.d).
 */

function stripIpv4MappedPrefix(value) {
  return String(value || "")
    .trim()
    .replace(/^::ffff:/i, "")
    .replace(/^:ffff:/i, "");
}

function parseIpv4Octets(value) {
  const clean = stripIpv4MappedPrefix(value);
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(clean)) return null;
  const parts = clean.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return parts;
}

function ipv4ToInt(value) {
  const parts = parseIpv4Octets(value);
  if (!parts) return null;
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0)
  ) >>> 0;
}

function normalizeIpv4(value) {
  const parts = parseIpv4Octets(value);
  if (!parts) return null;
  return parts.join(".");
}

function parseCidr(cidr) {
  const raw = String(cidr || "").trim();
  const match = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return null;
  const ipInt = ipv4ToInt(match[1]);
  const prefix = Number(match[2]);
  if (ipInt == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (ipInt & mask) >>> 0, mask, prefix };
}

function isIpv4InCidr(ip, cidr) {
  const addr = ipv4ToInt(ip);
  const parsed = parseCidr(cidr);
  if (addr == null || !parsed) return false;
  return ((addr & parsed.mask) >>> 0) === parsed.network;
}

function isIpv4InCidrs(ip, cidrs) {
  if (!Array.isArray(cidrs) || cidrs.length === 0) return false;
  return cidrs.some((cidr) => isIpv4InCidr(ip, cidr));
}

module.exports = {
  stripIpv4MappedPrefix,
  parseIpv4Octets,
  ipv4ToInt,
  normalizeIpv4,
  parseCidr,
  isIpv4InCidr,
  isIpv4InCidrs,
};
