/**
 * Routing service ORS response mapping.
 * Run: node tests/routing.service.test.js
 */
const assert = require("assert");
const routingService = require("../src/services/routing.service");

function testParseCoord() {
  assert.strictEqual(routingService.parseCoord("-33.9", "originLat"), -33.9);
  assert.throws(() => routingService.parseCoord("nope", "originLat"), /valid number/);
}

async function testGetDirectionsMock() {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTESERVICE_API_KEY;
  process.env.OPENROUTESERVICE_API_KEY = "test-key";

  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        features: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [18.4, -33.9],
                [18.41, -33.91],
              ],
            },
            properties: {
              summary: { duration: 720, distance: 5400 },
            },
          },
        ],
      };
    },
  });

  try {
    const result = await routingService.getDirections(-33.9, 18.4, -33.91, 18.41);
    assert.strictEqual(result.durationSeconds, 720);
    assert.strictEqual(result.distanceMeters, 5400);
    assert.strictEqual(result.durationText, "12 mins");
    assert.strictEqual(result.geometry.type, "LineString");
    assert.strictEqual(result.geometry.coordinates.length, 2);
    assert.ok(result.bounds.sw.lat < result.bounds.ne.lat);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTESERVICE_API_KEY;
    else process.env.OPENROUTESERVICE_API_KEY = originalKey;
  }
}

async function run() {
  testParseCoord();
  await testGetDirectionsMock();
  console.log("routing.service.test.js: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
