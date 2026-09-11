const PRIMARY_SA_BANKS_PATH = "/bank?currency=ZAR&enabled_for_verification=true";
const FALLBACK_SA_BANKS_PATH = "/bank?country=south%20africa";

function normalizeCountry(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
}

function isSouthAfricaZarBank(bank) {
  const currency = String(bank?.currency || "").trim().toUpperCase();
  if (currency !== "ZAR") return false;
  const country = String(bank?.country || "").trim();
  if (!country) return true;
  return normalizeCountry(country) === "south africa";
}

function toSafeBankRow(bank) {
  return {
    name: bank?.name || null,
    code: bank?.code || null,
    country: bank?.country || null,
    currency: bank?.currency || null,
    type: bank?.type || null,
    supported_types: Array.isArray(bank?.supported_types) ? bank.supported_types : bank?.supported_types || null,
    active: typeof bank?.active === "boolean" ? bank.active : bank?.active ?? null,
  };
}

function classifyBankNameMapping(banks) {
  const names = (Array.isArray(banks) ? banks : []).map((b) => String(b.name || "").trim()).filter(Boolean);
  const uniqueCodes = new Set(
    (Array.isArray(banks) ? banks : []).map((b) => String(b.code || "").trim()).filter(Boolean)
  );
  if (names.length === 0 || uniqueCodes.size === 0) {
    return {
      classification: "NO",
      reason: "List Banks returned no SA name/code pairs",
    };
  }
  return {
    classification: "PARTIAL",
    reason:
      "EloFix stores free-text bankName plus SA branchCode. Paystack requires settlement_bank/bank_code from this list. Exact name match can work after normalization/aliases; branchCode is not bank_code.",
  };
}

function selectSouthAfricaZarBanks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.filter(isSouthAfricaZarBank).map(toSafeBankRow);
}

async function fetchSouthAfricanBanks(paystackRequest) {
  const primary = await paystackRequest("GET", PRIMARY_SA_BANKS_PATH);
  const primaryBanks = selectSouthAfricaZarBanks(primary?.data);
  if (primaryBanks.length > 0) {
    return {
      query: PRIMARY_SA_BANKS_PATH,
      fallbackUsed: false,
      banks: primaryBanks,
    };
  }

  const fallback = await paystackRequest("GET", FALLBACK_SA_BANKS_PATH);
  const fallbackBanks = selectSouthAfricaZarBanks(fallback?.data);
  return {
    query: FALLBACK_SA_BANKS_PATH,
    fallbackUsed: true,
    banks: fallbackBanks,
  };
}

module.exports = {
  PRIMARY_SA_BANKS_PATH,
  FALLBACK_SA_BANKS_PATH,
  isSouthAfricaZarBank,
  toSafeBankRow,
  classifyBankNameMapping,
  selectSouthAfricaZarBanks,
  fetchSouthAfricanBanks,
};
