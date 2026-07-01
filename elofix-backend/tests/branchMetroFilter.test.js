/**
 * Branch metro filter integration (no DB).
 * Run: node tests/branchMetroFilter.test.js
 */
const assert = require("assert");
const {
  branchMatchesCustomerLocation,
  resolveCustomerMetrosWithCoords,
} = require("../src/utils/serviceAreaMatch.util");

function simulateBranchList(branches, query) {
  const lat = query.lat != null ? Number(query.lat) : NaN;
  const lng = query.lng != null ? Number(query.lng) : NaN;
  const hasUserCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const customerLocation = {
    metro: String(query.metro || "").trim() || undefined,
    city: String(query.city || "").trim() || undefined,
    area: String(query.area || "").trim() || undefined,
    suburb: String(query.suburb || "").trim() || undefined,
  };

  const customerMetros = resolveCustomerMetrosWithCoords(
    customerLocation,
    hasUserCoords ? lat : undefined,
    hasUserCoords ? lng : undefined
  );

  let list = [...branches];
  if (customerMetros.length > 0) {
    list = list.filter((s) =>
      branchMatchesCustomerLocation(
        {
          city: s.city,
          area: s.area,
          address: s.address,
          name: s.name,
          displayName: s.displayName,
          latitude: s.latitude,
          longitude: s.longitude,
        },
        customerLocation,
        customerMetros
      )
    );
  }
  return list.map((s) => s.displayName || s.name);
}

function testMilnertonJobExcludesMidrand() {
  const branches = [
    { displayName: "ABC Build - Bellville", city: "Cape Town", name: "Bellville" },
    { displayName: "ABC Build - Midrand", area: "Allan Road", name: "Midrand" },
  ];
  const names = simulateBranchList(branches, {
    metro: "Cape Town",
    city: "Milnerton",
    lat: -33.88,
    lng: 18.49,
  });
  assert.deepStrictEqual(names, ["ABC Build - Bellville"]);
}

function testJohannesburgCustomerExcludesCapeTown() {
  const branches = [
    { displayName: "ABC Build - Bellville", city: "Cape Town", name: "Bellville" },
    { displayName: "ABC Build - Midrand", name: "Midrand", area: "Allan Road" },
  ];
  const names = simulateBranchList(branches, {
    city: "Sandton",
    lat: -26.0,
    lng: 28.05,
  });
  assert.deepStrictEqual(names, ["ABC Build - Midrand"]);
}

function run() {
  testMilnertonJobExcludesMidrand();
  testJohannesburgCustomerExcludesCapeTown();
  console.log("branchMetroFilter.test.js: all tests passed");
}

run();
