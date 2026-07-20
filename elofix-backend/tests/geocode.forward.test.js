/**
 * Geocode service forward/search helpers.
 * Run: node tests/geocode.forward.test.js
 */
const assert = require("assert");
const geocodeService = require("../src/services/geocode.service");

async function testSanitizeQueryRejectsShort() {
  let threw = false;
  try {
    await geocodeService.forwardGeocode("a");
  } catch (err) {
    threw = true;
    assert.match(String(err.message), /2 characters/i);
  }
  assert.strictEqual(threw, true);
}

async function testForwardGeocodeMock() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return [
        {
          lat: "-33.9249",
          lon: "18.4241",
          display_name: "Cape Town, South Africa",
        },
      ];
    },
  });

  try {
    const result = await geocodeService.forwardGeocode("Cape Town");
    assert.strictEqual(result.lat, -33.9249);
    assert.strictEqual(result.lng, 18.4241);
    assert.ok(result.label.includes("Cape Town"));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testSearchAddressesMock() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return [
        { lat: "-26.2041", lon: "28.0473", display_name: "Johannesburg" },
        { lat: "-33.9249", lon: "18.4241", display_name: "Cape Town" },
      ];
    },
  });

  try {
    const result = await geocodeService.searchAddresses("town");
    assert.ok(Array.isArray(result.suggestions));
    assert.strictEqual(result.suggestions.length, 2);
    assert.strictEqual(result.suggestions[0].label, "Johannesburg");
  } finally {
    global.fetch = originalFetch;
  }
}

async function run() {
  await testSanitizeQueryRejectsShort();
  await testForwardGeocodeMock();
  await testSearchAddressesMock();
  console.log("geocode.forward.test.js: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
