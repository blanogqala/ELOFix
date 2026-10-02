const AppError = require("./AppError");

function normalizePassportIdentity(number, country) {
  const passportNumber = String(number ?? "").trim().toUpperCase();
  const passportCountry = String(country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(passportCountry)) {
    throw new AppError("Enter the two-letter passport issuing country code", 400);
  }
  if (!/^[A-Z0-9]{4,20}$/.test(passportNumber)) {
    throw new AppError("Enter a passport number containing 4–20 letters or digits", 400);
  }
  return { passportNumber, passportCountry };
}

/**
 * Revoke marketplace approval and identity documents only when the stored
 * identity actually changes. Resubmitting the same SA ID or passport must not
 * reset review — the profile form keeps a saved SA ID in the input and sends
 * it again on the next save.
 */
function shouldResetIdentityDocuments(previous, next) {
  const previousType = previous?.identityType || "SA_ID";
  const nextType = next?.identityType || "SA_ID";
  if (previousType !== nextType) return true;
  if (nextType === "PASSPORT") {
    const hashChanged =
      next?.passportNumberHash != null && next.passportNumberHash !== previous?.passportNumberHash;
    const countryChanged =
      next?.passportCountry != null &&
      (next.passportCountry || "") !== (previous?.passportCountry || "");
    return hashChanged || countryChanged;
  }
  if (!next?.saIdNumberHash) return false;
  return next.saIdNumberHash !== previous?.saIdNumberHash;
}

module.exports = { normalizePassportIdentity, shouldResetIdentityDocuments };
