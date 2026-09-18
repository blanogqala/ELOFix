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
  };
}

function amountsClose(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.009;
}

function invoiceMatchesIntent(invoice, intent) {
  const inv = flattenInvoicePayload(invoice);
  const intentId = String(intent.id);
  if (trimStr(inv.paymentIntentId) === intentId) return true;
  if (trimStr(inv.id) === synthesizedInvoiceId(intentId)) return true;

  const expectedType = invoiceTypeFromKind(intent.kind);
  if (!expectedType) return false;
  if (String(inv.type || "").toLowerCase() !== expectedType) return false;
  if (!amountsClose(inv.totalAmount, intent.amount)) return false;

  const intentPaymentType = trimStr(intent.paymentType).toUpperCase();
  const invPaymentType = trimStr(inv.paymentType).toUpperCase();
  if (intentPaymentType && invPaymentType && intentPaymentType !== invPaymentType) {
    return false;
  }

  if (intent.jobId && trimStr(inv.jobId) === String(intent.jobId)) return true;
  if (intent.materialOrderId && trimStr(inv.materialOrderId) === String(intent.materialOrderId)) {
    return true;
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

  const meta = {
    paymentIntentId: String(intent.id),
    kind: String(kind || ""),
    paymentType: intent.paymentType || undefined,
    materialOrderId,
    jobStoreOrderId,
    storeName,
    jobTitle,
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
    paymentMethod: "Card",
    cardLast4: intent.cardLast4 || undefined,
    paidAt,
    createdAt: paidAt,
    materialOrderId,
    jobStoreOrderId,
    paymentIntentId: String(intent.id),
    paymentType: intent.paymentType || undefined,
    kind: String(kind || ""),
    storeName,
    jobTitle,
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
    meta: {
      ...asObject(extra.meta),
      ...asObject(current.meta),
      paymentIntentId: current.paymentIntentId || extra.paymentIntentId,
      materialOrderId: current.materialOrderId || extra.materialOrderId,
      jobStoreOrderId: current.jobStoreOrderId || extra.jobStoreOrderId,
    },
  });
}

function mergeStoredInvoicesWithPaidIntents(storedInvoices, paidIntents) {
  const out = (Array.isArray(storedInvoices) ? storedInvoices : []).map((inv) => flattenInvoicePayload(inv));
  const used = new Set();
  const intents = Array.isArray(paidIntents) ? paidIntents : [];

  for (const intent of intents) {
    if (!intent || !intent.id) continue;
    if (!invoiceTypeFromKind(intent.kind)) continue;
    const matchIdx = out.findIndex((inv, idx) => !used.has(idx) && invoiceMatchesIntent(inv, intent));
    if (matchIdx >= 0) {
      used.add(matchIdx);
      out[matchIdx] = enrichInvoiceFromIntent(out[matchIdx], intent);
      continue;
    }
    out.push(invoiceFromPaidIntent(intent));
  }

  out.sort((a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());
  return out;
}

module.exports = {
  flattenInvoicePayload,
  invoiceTypeFromKind,
  synthesizedInvoiceId,
  parseSynthesizedIntentId,
  invoiceMatchesIntent,
  invoiceFromPaidIntent,
  mergeStoredInvoicesWithPaidIntents,
};
