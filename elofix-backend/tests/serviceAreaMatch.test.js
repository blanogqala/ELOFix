/**
 * Metro service area matching.
 * Run: node tests/serviceAreaMatch.test.js
 */
const assert = require("assert");
const {
  extractMetroFromText,
  resolveCustomerMetros,
  providerMatchesCustomerLocation,
} = require("../src/utils/serviceAreaMatch.util");

function testExtractMetroFromText() {
  assert.strictEqual(extractMetroFromText("City of Cape Town"), "Cape Town");
  assert.strictEqual(extractMetroFromText("cape town"), "Cape Town");
  assert.strictEqual(extractMetroFromText("Johannesburg"), "Johannesburg");
  assert.strictEqual(extractMetroFromText("Milnerton"), null);
  assert.strictEqual(extractMetroFromText(""), null);
}

function testResolveCustomerMetros() {
  const metros = resolveCustomerMetros({
    metro: "Cape Town",
    city: "Milnerton",
    area: "Milnerton",
  });
  assert.deepStrictEqual(metros, ["Cape Town"]);
}

function testMilnertonCustomerCapeTownProvider() {
  const provider = { city: "Cape Town", serviceAreas: ["Cape Town"] };
  const customer = { metro: "Cape Town", city: "Milnerton", area: "Milnerton" };
  assert.strictEqual(providerMatchesCustomerLocation(provider, customer), true);
}

function testCapeTownCustomerJohannesburgProvider() {
  const provider = { city: "Johannesburg", serviceAreas: ["Johannesburg"] };
  const customer = { metro: "Cape Town", city: "Milnerton" };
  assert.strictEqual(providerMatchesCustomerLocation(provider, customer), false);
}

function testCustomAreaSandton() {
  const provider = { city: "", serviceAreas: ["Sandton"] };
  const customer = { city: "Johannesburg", area: "Sandton" };
  assert.strictEqual(providerMatchesCustomerLocation(provider, customer), true);
}

function testNoLocationPassesAll() {
  const provider = { city: "Johannesburg", serviceAreas: ["Johannesburg"] };
  assert.strictEqual(providerMatchesCustomerLocation(provider, {}), true);
  assert.strictEqual(providerMatchesCustomerLocation(provider, null), true);
}

function run() {
  testExtractMetroFromText();
  testResolveCustomerMetros();
  testMilnertonCustomerCapeTownProvider();
  testCapeTownCustomerJohannesburgProvider();
  testCustomAreaSandton();
  testNoLocationPassesAll();
  console.log("serviceAreaMatch.test.js: all tests passed");
}

run();
