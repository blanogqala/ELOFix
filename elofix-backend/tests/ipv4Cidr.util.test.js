const assert = require("assert");
const {
  ipv4ToInt,
  normalizeIpv4,
  isIpv4InCidr,
  isIpv4InCidrs,
} = require("../src/utils/ipv4Cidr.util");
const { PAYFAST_IP_CIDRS, isPayfastIp } = require("../src/services/payments/payfast.gateway");

function assertAllowed(ip) {
  assert.strictEqual(isIpv4InCidrs(ip, PAYFAST_IP_CIDRS), true, `${ip} must be allowed`);
}

function assertDenied(ip) {
  assert.strictEqual(isIpv4InCidrs(ip, PAYFAST_IP_CIDRS), false, `${ip} must be denied`);
}

function testOfficialRanges() {
  assert.deepStrictEqual(PAYFAST_IP_CIDRS, [
    "197.97.145.144/28",
    "41.74.179.192/27",
    "102.216.36.0/28",
    "102.216.36.128/28",
    "144.126.193.139/32",
  ]);

  assertAllowed("197.97.145.144");
  assertAllowed("197.97.145.159");
  assertDenied("197.97.145.160");

  assertAllowed("41.74.179.192");
  assertAllowed("41.74.179.223");
  assertDenied("41.74.179.224");

  assertAllowed("102.216.36.0");
  assertAllowed("102.216.36.15");
  assertDenied("102.216.36.16");

  assertAllowed("102.216.36.128");
  assertAllowed("102.216.36.143");
  assertDenied("102.216.36.144");

  assertAllowed("144.126.193.139");
  assertDenied("8.8.8.8");
  assertDenied("1.1.1.1");
  assertDenied("127.0.0.1");
}

function testMappedIpv6() {
  assert.strictEqual(normalizeIpv4("::ffff:197.97.145.150"), "197.97.145.150");
  assertAllowed("::ffff:197.97.145.150");
  assertDenied("::ffff:8.8.8.8");
  assert.strictEqual(ipv4ToInt("not-an-ip"), null);
  assert.strictEqual(isIpv4InCidr("197.97.145.150", "bad"), false);
}

function testProductionSkipIpIgnored() {
  const prevEnv = process.env.NODE_ENV;
  const prevSkip = process.env.PAYFAST_SKIP_IP_CHECK;
  process.env.NODE_ENV = "production";
  process.env.PAYFAST_SKIP_IP_CHECK = "true";
  try {
    assert.strictEqual(isPayfastIp("8.8.8.8"), false, "production must not honor PAYFAST_SKIP_IP_CHECK");
    assert.strictEqual(isPayfastIp("197.97.145.150"), true);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevSkip === undefined) delete process.env.PAYFAST_SKIP_IP_CHECK;
    else process.env.PAYFAST_SKIP_IP_CHECK = prevSkip;
  }
}

testOfficialRanges();
testMappedIpv6();
testProductionSkipIpIgnored();
console.log("ipv4Cidr.util.test.js: all passed");
