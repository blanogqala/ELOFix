/**
 * Metro service area matching.
 * Run: node tests/serviceAreaMatch.test.js
 */
const assert = require("assert");
const {
  extractMetroFromText,
  extractMetroFromSuburb,
  resolveMetroFromCoordinates,
  resolveCustomerMetros,
  resolveCustomerMetrosWithCoords,
  resolveBranchMetros,
  providerMatchesCustomerLocation,
  branchMatchesCustomerLocation,
} = require("../src/utils/serviceAreaMatch.util");

function testExtractMetroFromText() {
  assert.strictEqual(extractMetroFromText("City of Cape Town"), "Cape Town");
  assert.strictEqual(extractMetroFromText("cape town"), "Cape Town");
  assert.strictEqual(extractMetroFromText("Johannesburg"), "Johannesburg");
  assert.strictEqual(extractMetroFromText("Milnerton"), "Cape Town");
  assert.strictEqual(extractMetroFromText(""), null);
}

function testExtractMetroFromSuburb() {
  assert.strictEqual(extractMetroFromSuburb("Midrand"), "Johannesburg");
  assert.strictEqual(extractMetroFromSuburb("Bellville"), "Cape Town");
  assert.strictEqual(extractMetroFromSuburb("ABC Build - Midrand"), "Johannesburg");
}

function testResolveMetroFromCoordinates() {
  assert.strictEqual(resolveMetroFromCoordinates(-33.88, 18.49), "Cape Town");
  assert.strictEqual(resolveMetroFromCoordinates(-25.99, 28.12), "Johannesburg");
  assert.strictEqual(resolveMetroFromCoordinates(0, 0), null);
}

function testResolveCustomerMetros() {
  const metros = resolveCustomerMetros({
    metro: "Cape Town",
    city: "Milnerton",
    area: "Milnerton",
  });
  assert.deepStrictEqual(metros, ["Cape Town"]);
}

function testResolveCustomerMetrosWithCoords() {
  const metros = resolveCustomerMetrosWithCoords({ city: "Somewhere" }, -33.88, 18.49);
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

function testCapeTownCustomerMidrandBranchExcluded() {
  const branch = { name: "ABC Build - Midrand", area: "Allan Road", city: "" };
  const customer = { metro: "Cape Town", city: "Milnerton" };
  assert.strictEqual(branchMatchesCustomerLocation(branch, customer), false);
}

function testCapeTownCustomerBellvilleBranchIncluded() {
  const branch = { name: "ABC Build - Bellville", city: "Cape Town" };
  const customer = { metro: "Cape Town", city: "Milnerton" };
  assert.strictEqual(branchMatchesCustomerLocation(branch, customer), true);
}

function testMilnertonCustomerNoMetroCapeTownBranch() {
  const branch = { name: "ABC Build - Bellville", city: "Cape Town" };
  const customer = { city: "Milnerton", area: "Milnerton" };
  const customerMetros = resolveCustomerMetros(customer);
  assert.deepStrictEqual(customerMetros, ["Cape Town"]);
  assert.strictEqual(branchMatchesCustomerLocation(branch, customer, customerMetros), true);
}

function testResolveBranchMetrosFromName() {
  const metros = resolveBranchMetros({ name: "ABC Build - Midrand", area: "Allan Road" });
  assert.deepStrictEqual(metros, ["Johannesburg"]);
}

function run() {
  testExtractMetroFromText();
  testExtractMetroFromSuburb();
  testResolveMetroFromCoordinates();
  testResolveCustomerMetros();
  testResolveCustomerMetrosWithCoords();
  testMilnertonCustomerCapeTownProvider();
  testCapeTownCustomerJohannesburgProvider();
  testCustomAreaSandton();
  testNoLocationPassesAll();
  testCapeTownCustomerMidrandBranchExcluded();
  testCapeTownCustomerBellvilleBranchIncluded();
  testMilnertonCustomerNoMetroCapeTownBranch();
  testResolveBranchMetrosFromName();
  console.log("serviceAreaMatch.test.js: all tests passed");
}

run();
