/**
 * Customer invoice read-model helpers.
 * Presentation-only: does not change payment amounts, modes, or gateway flows.
 */

function trimStr(value) {
  return value == null ? "" : String(value).trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function invoiceTypeFromKind(kind) {
  const k = String(kind || "").toUpperCase();
  if (k === "LABOR") return "labor";
  if (k === "DELIVERY_FEE") return "delivery";
  if (k === "MATERIAL_ORDER" || k === "JOB_STORE_ORDER") return "materials";
  return null;
}

function synthesizedInvoiceId(intentId) {
  return `INV-PI-${String(intentId)}`;
}

function parseSynthesizedIntentId(invoiceId) {
  const id = String(invoiceId || "");
  if (!id.startsWith("INV-PI-")) return null;
  const rest = id.slice("INV-PI-".length).trim();
  return rest || null;
}

function pickMetaValue(invoice, key) {
  const meta = asObject(invoice.meta);
  const top = invoice[key];
  if (top != null && String(top).trim() !== "") return top;
  if (meta[key] != null && String(meta[key]).trim() !== "") return meta[key];
  return undefined;
}

function flattenInvoicePayload(payload) {
  const inv = asObject(payload);
  const meta = asObject(inv.meta);
  const materialOrderId = pickMetaValue(inv, "materialOrderId") || pickMetaValue(inv, "orderId");
  const jobStoreOrderId = pickMetaValue(inv, "jobStoreOrderId");
  const paymentIntentId = pickMetaValue(inv, "paymentIntentId");
  const paymentType = pickMetaValue(inv, "paymentType");
  const kind = pickMetaValue(inv, "kind");
  const storeName = pickMetaValue(inv, "storeName") || pickMetaValue(inv, "supplierName");
  const jobTitle = pickMetaValue(inv, "jobTitle");
  const merchantReference = pickMetaValue(inv, "merchantReference") || pickMetaValue(inv, "paymentRef");

  return {
    ...inv,
    jobId: inv.jobId != null ? String(inv.jobId) : "",
    meta: Object.keys(meta).length > 0 ? meta : inv.meta,
    materialOrderId: materialOrderId != null ? String(materialOrderId) : undefined,
    jobStoreOrderId: jobStoreOrderId != null ? String(jobStoreOrderId) : undefined,
    paymentIntentId: paymentIntentId != null ? String(paymentIntentId) : undefined,
    paymentType: paymentType != null ? String(paymentType) : undefined,
    kind: kind != null ? String(kind) : undefined,
    storeName: storeName != null ? String(storeName) : undefined,
    jobTitle: jobTitle != null ? String(jobTitle) : undefined,
    merchantReference: merchantReference != null ? String(merchantReference) : undefined,
  };
}

function amountsClose(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.009;
}

function utcDay(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : "";
  }
  return d.toISOString().slice(0, 10);
}

function typesAlign(invoice, intent) {
  const expectedType = invoiceTypeFromKind(intent.kind);
  if (!expectedType) return false;
  return String(invoice.type || "").toLowerCase() === expectedType;
}

function scopeAligns(invoice, intent) {
  const inv = flattenInvoicePayload(invoice);
  if (intent.jobId && trimStr(inv.jobId) === String(intent.jobId)) return true;
  if (intent.materialOrderId && trimStr(inv.materialOrderId) === String(intent.materialOrderId)) return true;
  if (intent.materialOrderId && trimStr(inv.jobStoreOrderId) === String(intent.materialOrderId)) return true;
  return false;
}

function identityMatch(invoice, intent) {
  const inv = flattenInvoicePayload(invoice);
  const intentId = String(intent.id);
  if (trimStr(inv.paymentIntentId) === intentId) return true;
  if (trimStr(inv.id) === synthesizedInvoiceId(intentId)) return true;
  return false;
}

function explicitStageMatch(invoice, intent) {
  const inv = flattenInvoicePayload(invoice);
  const invPt = trimStr(inv.paymentType).toUpperCase();
  const intentPt = trimStr(intent.paymentType).toUpperCase();
  if (!invPt || !intentPt) return false;
  if (invPt !== intentPt) return false;
  if (!typesAlign(inv, intent)) return false;
  if (!amountsClose(inv.totalAmount, intent.amount)) return false;
  return scopeAligns(inv, intent);
}

function collectInvoiceRefs(invoice) {
  const inv = flattenInvoicePayload(invoice);
  const meta = asObject(inv.meta);
  return [inv.merchantReference, inv.paymentRef, meta.merchantReference, meta.paymentRef, meta.gatewayTransactionId]
    .map((v) => trimStr(v))
    .filter(Boolean);
}

function collectIntentRefs(intent) {
  const gp = asObject(intent.gatewayPayload);
  const nested = asObject(gp.data);
  return [
    intent.merchantReference,
    intent.gatewayTransactionId,
    gp.reference,
    gp.merchantReference,
    nested.reference,
  ]
    .map((v) => trimStr(v))
    .filter(Boolean);
}

function referenceMatch(invoice, intent) {
  const invRefs = collectInvoiceRefs(invoice);
  const intentRefs = collectIntentRefs(intent);
  if (invRefs.length === 0 || intentRefs.length === 0) return false;
  const intentSet = new Set(intentRefs.map((r) => r.toUpperCase()));
  return invRefs.some((r) => intentSet.has(r.toUpperCase()));
}

function uniqueDateMatch(invoice, intent) {
  const inv = flattenInvoicePayload(invoice);
  if (!typesAlign(inv, intent)) return false;
  if (!amountsClose(inv.totalAmount, intent.amount)) return false;
  if (!scopeAligns(inv, intent)) return false;
  const invDay = utcDay(inv.paidAt || inv.createdAt);
  const intentDay = utcDay(intent.paidAt || intent.createdAt);
  if (!invDay || !intentDay || invDay !== intentDay) return false;
  return true;
}

function uniqueAmountCandidate(invoice, intent) {
  const inv = flattenInvoicePayload(invoice);
  if (!typesAlign(inv, intent)) return false;
  if (!amountsClose(inv.totalAmount, intent.amount)) return false;
  if (!scopeAligns(inv, intent)) return false;
  const invPt = trimStr(inv.paymentType).toUpperCase();
  const intentPt = trimStr(intent.paymentType).toUpperCase();
  if (invPt && intentPt && invPt !== intentPt) return false;
  return true;
}

function isUniquePair(invoice, intent, unusedInvoices, unusedIntents, predicate) {
  const intentHits = unusedIntents.filter((i) => predicate(invoice, i));
  if (intentHits.length !== 1) return false;
  if (String(intentHits[0].id) !== String(intent.id)) return false;
  const invoiceHits = unusedInvoices.filter((inv) => predicate(inv, intent));
  if (invoiceHits.length !== 1) return false;
  return trimStr(invoiceHits[0].id) === trimStr(flattenInvoicePayload(invoice).id);
}

/**
 * Strong matching only. Pass siblingIntents so equal-amount 50/50 rows fail closed.
 */
function invoiceMatchesIntent(invoice, intent, context) {
  const siblings = Array.isArray(context && context.siblingIntents) ? context.siblingIntents : [intent];
  const unusedInvoices = Array.isArray(context && context.unusedInvoices) ? context.unusedInvoices : [invoice];
  const unusedIntents = siblings.filter(Boolean);

  if (identityMatch(invoice, intent)) return true;
  const invBound = trimStr(flattenInvoicePayload(invoice).paymentIntentId);
  if (invBound && invBound !== String(intent.id)) return false;
  const synId = parseSynthesizedIntentId(flattenInvoicePayload(invoice).id);
  if (synId && synId !== String(intent.id)) return false;
  if (explicitStageMatch(invoice, intent)) {
    return isUniquePair(invoice, intent, unusedInvoices, unusedIntents, explicitStageMatch);
  }
  if (referenceMatch(invoice, intent)) {
    return isUniquePair(invoice, intent, unusedInvoices, unusedIntents, referenceMatch);
  }
  if (uniqueDateMatch(invoice, intent)) {
    return isUniquePair(invoice, intent, unusedInvoices, unusedIntents, uniqueDateMatch);
  }
  if (uniqueAmountCandidate(invoice, intent)) {
    return isUniquePair(invoice, intent, unusedInvoices, unusedIntents, uniqueAmountCandidate);
  }
  return false;
}

function storeNameFromIntent(intent) {
  const orderPayload = asObject(intent.materialOrder && intent.materialOrder.payload);
  const fromOrder = trimStr(orderPayload.storeName || orderPayload.supplierDisplayName || orderPayload.supplierName);
  if (fromOrder) return fromOrder;
  const gp = asObject(intent.gatewayPayload);
  const nested = asObject(gp.metadata);
  return trimStr(gp.storeName || nested.storeName || nested.supplierName) || undefined;
}

function jobStoreOrderIdFromIntent(intent) {
  const gp = asObject(intent.gatewayPayload);
  const nested = asObject(gp.metadata);
  const orderId = trimStr(gp.orderId || nested.orderId || nested.jobStoreOrderId);
  return orderId || undefined;
}

function readGatewayChannel(intent) {
  const gp = asObject(intent.gatewayPayload);
  const nested = asObject(gp.data);
  const raw = asObject(gp.raw);
  return String(gp.channel || nested.channel || raw.channel || "")
    .trim()
    .toLowerCase();
}

const CHANNEL_LABELS = {
  card: "Card",
  bank: "Bank",
  bank_transfer: "Bank",
  eft: "Bank",
  mobile_money: "Mobile money",
  ussd: "USSD",
  qr: "QR",
  apple_pay: "Apple Pay",
};

function paymentMethodLabelFromIntent(intent) {
  const channel = readGatewayChannel(intent);
  if (CHANNEL_LABELS[channel]) return CHANNEL_LABELS[channel];
  const provider = String(intent.provider || "").toUpperCase();
  if (provider === "PAYSTACK") return "Paystack";
  if (provider === "PAYFAST") return "PayFast";
  return "Payment provider";
}

function lineItemForIntent(kind, paymentType, amount) {
  const k = String(kind || "").toUpperCase();
  const pt = String(paymentType || "").toUpperCase();
  let description = "Payment";
  if (k === "LABOR") {
    if (pt === "DEPOSIT") description = "Service deposit";
    else if (pt === "COMPLETION") description = "Service completion";
    else description = "Labor / Service";
  } else if (k === "DELIVERY_FEE") {
    description = "Delivery payment";
  } else {
    description = "Materials purchase";
  }
  const total = Number(amount || 0);
  return { description, quantity: 1, unitPrice: total, total };
}

function invoiceFromPaidIntent(intent) {
  const kind = intent.kind;
  const type = invoiceTypeFromKind(kind);
  const job = intent.job || {};
  const materialOrder = intent.materialOrder || {};
  const materialOrderId = intent.materialOrderId ? String(intent.materialOrderId) : undefined;
  const jobIdFromOrder = materialOrder.jobId ? String(materialOrder.jobId) : "";
  const jobId = intent.jobId ? String(intent.jobId) : jobIdFromOrder;
  const paidAt = intent.paidAt
    ? new Date(intent.paidAt).toISOString()
    : new Date(intent.createdAt || Date.now()).toISOString();
  const amount = Number(intent.amount || 0);
  const storeName = storeNameFromIntent(intent);
  const jobStoreOrderId = jobStoreOrderIdFromIntent(intent);
  const jobTitle = trimStr(job.title) || undefined;
  const status = String(intent.state || "").toUpperCase() === "PARTIALLY_REFUNDED" ? "partially_refunded" : "paid";
  const last4 = trimStr(intent.cardLast4);
  const cardLast4 = /^\d{4}$/.test(last4) ? last4 : undefined;

  const meta = {
    paymentIntentId: String(intent.id),
    kind: String(kind || ""),
    paymentType: intent.paymentType || undefined,
    materialOrderId,
    jobStoreOrderId,
    storeName,
    jobTitle,
    merchantReference: intent.merchantReference || undefined,
    source: "payment_intent_read_model",
  };

  return flattenInvoicePayload({
    id: synthesizedInvoiceId(intent.id),
    jobId,
    userId: String(intent.userId || ""),
    type,
    status,
    totalAmount: amount,
    lineItems: [lineItemForIntent(kind, intent.paymentType, amount)],
    hardwareStores: storeName ? [storeName] : [],
    paymentMethod: paymentMethodLabelFromIntent(intent),
    cardLast4,
    paidAt,
    createdAt: paidAt,
    materialOrderId,
    jobStoreOrderId,
    paymentIntentId: String(intent.id),
    paymentType: intent.paymentType || undefined,
    kind: String(kind || ""),
    storeName,
    jobTitle,
    merchantReference: intent.merchantReference || undefined,
    meta,
  });
}

function enrichInvoiceFromIntent(invoice, intent) {
  const current = flattenInvoicePayload(invoice);
  const extra = invoiceFromPaidIntent(intent);
  return flattenInvoicePayload({
    ...current,
    materialOrderId: current.materialOrderId || extra.materialOrderId,
    jobStoreOrderId: current.jobStoreOrderId || extra.jobStoreOrderId,
    paymentIntentId: current.paymentIntentId || extra.paymentIntentId,
    paymentType: current.paymentType || extra.paymentType,
    kind: current.kind || extra.kind,
    storeName: current.storeName || extra.storeName,
    jobTitle: current.jobTitle || extra.jobTitle,
    merchantReference: current.merchantReference || extra.merchantReference,
    paymentMethod:
      current.paymentMethod && String(current.paymentMethod).toLowerCase() !== "card"
        ? current.paymentMethod
        : extra.paymentMethod,
    cardLast4: current.cardLast4 || extra.cardLast4,
    meta: {
      ...asObject(extra.meta),
      ...asObject(current.meta),
      paymentIntentId: current.paymentIntentId || extra.paymentIntentId,
      materialOrderId: current.materialOrderId || extra.materialOrderId,
      jobStoreOrderId: current.jobStoreOrderId || extra.jobStoreOrderId,
    },
  });
}

function sameFinancialScope(a, b) {
  const left = flattenInvoicePayload(a);
  const right = flattenInvoicePayload(b);
  if (trimStr(left.jobId) && trimStr(left.jobId) === trimStr(right.jobId)) return true;
  if (trimStr(left.materialOrderId) && trimStr(left.materialOrderId) === trimStr(right.materialOrderId)) {
    return true;
  }
  return false;
}

function isAmbiguousStoredDuplicate(stored, synthesizedList) {
  const inv = flattenInvoicePayload(stored);
  if (trimStr(inv.paymentIntentId)) return false;
  if (parseSynthesizedIntentId(inv.id)) return false;
  if (String(inv.type || "").toLowerCase() === "refund") return false;
  return synthesizedList.some(
    (syn) =>
      String(syn.type || "").toLowerCase() === String(inv.type || "").toLowerCase() &&
      amountsClose(syn.totalAmount, inv.totalAmount) &&
      sameFinancialScope(inv, syn)
  );
}

function mergeStoredInvoicesWithPaidIntents(storedInvoices, paidIntents) {
  const out = (Array.isArray(storedInvoices) ? storedInvoices : []).map((inv) => flattenInvoicePayload(inv));
  const used = new Set();
  const intents = (Array.isArray(paidIntents) ? paidIntents : []).filter((i) => i && i.id && invoiceTypeFromKind(i.kind));
  const matchedIntentIds = new Set();

  const unusedInvoices = () => out.filter((_, idx) => !used.has(idx));
  const unusedIntents = () => intents.filter((i) => !matchedIntentIds.has(String(i.id)));

  for (const intent of intents) {
    const ctx = { siblingIntents: unusedIntents(), unusedInvoices: unusedInvoices() };
    const matchIdx = out.findIndex((inv, idx) => !used.has(idx) && invoiceMatchesIntent(inv, intent, ctx));
    if (matchIdx >= 0) {
      used.add(matchIdx);
      matchedIntentIds.add(String(intent.id));
      out[matchIdx] = enrichInvoiceFromIntent(out[matchIdx], intent);
    }
  }

  const synthesized = [];
  for (const intent of unusedIntents()) {
    synthesized.push(invoiceFromPaidIntent(intent));
  }

  const kept = out.filter((inv, idx) => used.has(idx) || !isAmbiguousStoredDuplicate(inv, synthesized));
  const merged = kept.concat(synthesized);
  merged.sort(
    (a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime()
  );
  return merged;
}

module.exports = {
  flattenInvoicePayload,
  invoiceTypeFromKind,
  synthesizedInvoiceId,
  parseSynthesizedIntentId,
  invoiceMatchesIntent,
  invoiceFromPaidIntent,
  mergeStoredInvoicesWithPaidIntents,
  paymentMethodLabelFromIntent,
};
