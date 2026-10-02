const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  normalizePassportIdentity,
  shouldResetIdentityDocuments,
} = require("../src/utils/passportIdentity.util");

assert.deepEqual(normalizePassportIdentity(" ab123456 ", "zw"), {
  passportNumber: "AB123456",
  passportCountry: "ZW",
});
for (const [number, country] of [
  ["", "ZW"],
  ["123", "ZW"],
  ["AB-1234", "ZW"],
  ["AB1234", ""],
  ["AB1234", "Zimbabwe"],
]) {
  assert.throws(() => normalizePassportIdentity(number, country));
}

const sameSaId = {
  identityType: "SA_ID",
  saIdNumberHash: "sa-id",
  passportNumberHash: null,
  passportCountry: null,
};
assert.equal(
  shouldResetIdentityDocuments(sameSaId, sameSaId),
  false,
  "Resubmitting the same SA ID must not revoke approval or delete identity documents"
);
assert.equal(
  shouldResetIdentityDocuments(sameSaId, { ...sameSaId, saIdNumberHash: "other-id" }),
  true
);

const samePassport = {
  identityType: "PASSPORT",
  saIdNumberHash: null,
  passportNumberHash: "passport-hash",
  passportCountry: "ZW",
};
assert.equal(shouldResetIdentityDocuments(samePassport, samePassport), false);
assert.equal(
  shouldResetIdentityDocuments(samePassport, { ...samePassport, passportCountry: "ZM" }),
  true
);
assert.equal(
  shouldResetIdentityDocuments(sameSaId, { ...samePassport }),
  true,
  "Switching identity type must require a new document review"
);

console.log("Passport identity validation passed");

// Run actual service functions with inert imports: no database or external services.
const service = { exports: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("../src/services/provider.service"), "utf8"), {
  module: service,
  exports: service.exports,
  require: (name) =>
    name.includes("AppError")
      ? require("../src/utils/AppError")
      : name.includes("jobStatusCounts")
        ? {}
        : {},
  console,
});
const { checkProviderProfileCompletion } = service.exports;
const profile = {
  identityType: "PASSPORT",
  passportNumberHash: "hash",
  companyRegistrationHash: "company",
  bio: "Experienced plumbing service provider",
  serviceAreas: ["Cape Town"],
  skills: ["plumbing"],
  laborPricing: {},
  documents: {
    idDoc: { url: "/passport.pdf" },
    companyReg: { url: "/company.pdf" },
    proofOfAddress: { url: "/address.pdf" },
  },
  settings: { businessHours: { Monday: { enabled: true, open: "08:00", close: "17:00" } } },
  withdrawalProfile: {},
};
assert.equal(
  checkProviderProfileCompletion(profile, { phone: "0821234567" }),
  false,
  "Passport alone must not complete onboarding"
);
profile.documents.workPermission = { url: "/permission.pdf" };
assert.equal(checkProviderProfileCompletion(profile, { phone: "0821234567" }), true);
profile.identityType = "SA_ID";
assert.equal(checkProviderProfileCompletion(profile, { phone: "0821234567" }), false);
profile.saIdNumberHash = "sa-id";
assert.equal(checkProviderProfileCompletion(profile, { phone: "0821234567" }), true);
console.log("Passport and SA ID onboarding completion passed");
