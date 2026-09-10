/**
 * PayFast webhook IP resolver — Render/Cloudflare topology only.
 * Run: node tests/payfastWebhookIp.util.test.js
 */
const assert = require("assert");
const { isPayfastIp } = require("../src/services/payments/payfast.gateway");
const { resolvePayfastWebhookClientIp } = require("../src/utils/payfastWebhookIp.util");

function testRenderPrefersCfConnectingIp() {
  const req = {
    ip: "172.71.146.175",
    headers: {
      "cf-connecting-ip": "197.97.145.150",
      "x-forwarded-for": "197.97.145.150, 172.71.146.175",
    },
    socket: { remoteAddress: "10.1.1.1" },
  };
  const resolved = resolvePayfastWebhookClientIp(req, { RENDER: "true" });
  assert.strictEqual(resolved, "197.97.145.150");
  assert.strictEqual(isPayfastIp(resolved), true);
}

function testMalformedCfFallsBackToXff() {
  const req = {
    ip: "172.71.146.175",
    headers: {
      "cf-connecting-ip": "not-an-ip",
      "x-forwarded-for": "197.97.145.150, 172.71.146.175",
    },
    socket: { remoteAddress: "10.1.1.1" },
  };
  assert.strictEqual(resolvePayfastWebhookClientIp(req, { RENDER: "true" }), "197.97.145.150");
}

function testMappedIpv4Normalized() {
  const req = {
    ip: "172.71.146.175",
    headers: { "cf-connecting-ip": "::ffff:197.97.145.150" },
    socket: { remoteAddress: "10.1.1.1" },
  };
  assert.strictEqual(resolvePayfastWebhookClientIp(req, { RENDER: "true" }), "197.97.145.150");
}

function testNonRenderCannotOverrideReqIp() {
  const req = {
    ip: "172.71.146.175",
    headers: {
      "cf-connecting-ip": "197.97.145.150",
      "x-forwarded-for": "197.97.145.150, 172.71.146.175",
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.strictEqual(resolvePayfastWebhookClientIp(req, { RENDER: "false" }), "172.71.146.175");
  assert.strictEqual(resolvePayfastWebhookClientIp(req, {}), "172.71.146.175");
}

function testRandomExternalIpFailsPayfastCidr() {
  assert.strictEqual(isPayfastIp("8.8.8.8"), false);
  const req = {
    ip: "8.8.8.8",
    headers: { "cf-connecting-ip": "8.8.8.8" },
    socket: { remoteAddress: "8.8.8.8" },
  };
  const resolved = resolvePayfastWebhookClientIp(req, { RENDER: "true" });
  assert.strictEqual(resolved, "8.8.8.8");
  assert.strictEqual(isPayfastIp(resolved), false);
}

testRenderPrefersCfConnectingIp();
testMalformedCfFallsBackToXff();
testMappedIpv4Normalized();
testNonRenderCannotOverrideReqIp();
testRandomExternalIpFailsPayfastCidr();
console.log("payfastWebhookIp.util.test.js: all passed");
