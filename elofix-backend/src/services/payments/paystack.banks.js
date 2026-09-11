const PRIMARY_SA_BANKS_PATH = "/bank?currency=ZAR&enabled_for_verification=true";
const FALLBACK_SA_BANKS_PATH = "/bank?country=south%20africa";

const BANK_NAME_ALIASES = {
  fnb: ["fnb", "first national bank", "first national bank of south africa"],
  absa: ["absa", "absa bank", "absa bank limited", "absabank"],
  "standard bank": ["standard bank", "standard bank of south africa", "stanbic", "standardbank"],
  nedbank: ["nedbank", "ned bank"],
  capitec: ["capitec", "capitec bank"],
  investec: ["investec", "investec bank"],
  "discovery bank": ["discovery", "discovery bank"],
  tymebank: ["tymebank", "tyme bank", "tyme"],
  "african bank": ["african bank"],
  bidvest: ["bidvest", "bidvest bank"],
  "access bank": ["access bank", "access bank south africa"],
};

function normalizeBankName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasGroupForName(bankName) {
  const wanted = normalizeBankName(bankName);
  if (!wanted) return null;
  for (const [group, aliases] of Object.entries(BANK_NAME_ALIASES)) {
    const names = [group, ...aliases].map(normalizeBankName);
    if (names.includes(wanted) || names.some((alias) => wanted === alias || wanted.includes(alias) || alias.includes(wanted))) {
      return names;
    }
  }
  return [wanted];
}

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

function selectSouthAfricaZarBanks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.filter(isSouthAfricaZarBank).map(toSafeBankRow);
}

/**
 * Resolve Paystack settlement_bank / bank_code from EloFix bankName.
 * Never uses EloFix branchCode. explicitCode must be a previously stored Paystack code.
 */
function resolvePaystackBankCode(banks, bankName, explicitCode) {
  const stored = String(explicitCode || "").trim();
  if (stored) return stored;

  const list = Array.isArray(banks) ? banks : [];
  const aliases = aliasGroupForName(bankName);
  if (!aliases) return null;

  const exact = list.find((b) => aliases.includes(normalizeBankName(b.name)));
  if (exact?.code) return String(exact.code).trim();

  const contains = list.filter((b) => {
    const n = normalizeBankName(b.name);
    return aliases.some((alias) => n.includes(alias) || alias.includes(n));
  });
  if (contains.length === 1 && contains[0].code) return String(contains[0].code).trim();
  return null;
}

/**
 * Guard: EloFix branchCode must never be sent as Paystack bank_code unless it
 * independently matched a Paystack List Banks `code` for the mapped bank name.
 */
function assertBankCodeNotBlindBranchCode(bankCode, branchCode, matchedFromList) {
  const code = String(bankCode || "").trim();
  const branch = String(branchCode || "").trim();
  if (!code || !branch) return;
  if (code === branch && !matchedFromList) {
    const err = new Error("Paystack bank_code must come from Paystack List Banks, not EloFix branchCode");
    err.code = "PAYSTACK_BANK_CODE_NOT_BRANCH";
    throw err;
  }
}

async function fetchSouthAfricanBanks(paystackRequest) {
  const primary = await paystackRequest("GET", PRIMARY_SA_BANKS_PATH);
  const primaryBanks = selectSouthAfricaZarBanks(primary?.json?.data ?? primary?.data);
  if (primaryBanks.length > 0) {
    return {
      query: PRIMARY_SA_BANKS_PATH,
      fallbackUsed: false,
      banks: primaryBanks,
    };
  }

  const fallback = await paystackRequest("GET", FALLBACK_SA_BANKS_PATH);
  const fallbackBanks = selectSouthAfricaZarBanks(fallback?.json?.data ?? fallback?.data);
  return {
    query: FALLBACK_SA_BANKS_PATH,
    fallbackUsed: true,
    banks: fallbackBanks,
  };
}

module.exports = {
  PRIMARY_SA_BANKS_PATH,
  FALLBACK_SA_BANKS_PATH,
  BANK_NAME_ALIASES,
  normalizeBankName,
  isSouthAfricaZarBank,
  toSafeBankRow,
  selectSouthAfricaZarBanks,
  resolvePaystackBankCode,
  assertBankCodeNotBlindBranchCode,
  fetchSouthAfricanBanks,
};
