const AppError = require("../utils/AppError");
const { resolveScopedUserId } = require("../utils/scopedUserId.util");
const paymentService = require("../services/payment.service");
const jobService = require("../services/job.service");
const paymentIntentService = require("../services/payments/paymentIntent.service");
const webhookService = require("../services/payments/webhook.service");

async function getSavedCards(req, res) {
  const userId = resolveScopedUserId(req, req.query.userId);
  const cards = await paymentService.getSavedCards(String(userId));
  res.json({ success: true, cards });
}

async function addCard(req, res) {
  const userId = resolveScopedUserId(req, req.body?.userId);
  const card = await paymentService.addCard(String(userId), req.body || {});
  res.status(201).json({ success: true, card });
}

async function deleteCard(req, res) {
  const userId = resolveScopedUserId(req, req.query.userId);
  await paymentService.deleteCard(String(userId), req.params.cardId);
  res.json({ success: true });
}

async function setDefaultCard(req, res) {
  const userId = resolveScopedUserId(req, req.body?.userId);
  await paymentService.setDefaultCard(String(userId), req.params.cardId);
  res.json({ success: true });
}

async function getInvoices(req, res) {
  const userId = resolveScopedUserId(req, req.query.userId);
  const invoices = await paymentService.getInvoices(String(userId));
  res.json({ success: true, invoices });
}

async function getInvoice(req, res) {
  const userId = resolveScopedUserId(req, req.query.userId);
  const invoice = await paymentService.getInvoiceById(String(userId), req.params.invoiceId);
  res.json({ success: true, invoice });
}

async function createInvoice(req, res) {
  const body = req.body || {};
  const userId = resolveScopedUserId(req, body.userId);
  const invoice = await paymentService.createInvoice({ ...body, userId });
  res.status(201).json({ success: true, invoice });
}

async function releaseEscrow(req, res) {
  const jobId = req.body?.jobId || req.body?.id;
  if (!jobId) {
    return res.status(400).json({ success: false, message: "jobId is required" });
  }
  const job = await jobService.releaseEscrowPayment(
    String(jobId),
    req.body?.amount,
    req.financialIdempotencyKey,
    req.financialRequestHash,
    req.financialIdempotencyRoute,
    req.user.userId,
    req.user.role
  );
  res.json({ success: true, job });
}

async function createRefundInvoice(req, res) {
  const invoice = await paymentService.createRefundInvoice(
    req.body?.userId || req.user.userId,
    req.body?.jobId,
    req.body?.laborRefund,
    req.body?.materialsRefund,
    req.body?.cardLast4
  );
  res.status(201).json({ success: true, invoice });
}

async function listPaymentProviders(req, res) {
  const providers = await paymentIntentService.listProviders();
  res.json({ success: true, providers });
}

async function createPaymentIntent(req, res) {
  if (String(req.user?.role) !== "CUSTOMER") {
    throw new AppError("Only customers can create payment intents", 403);
  }
  const body = req.body || {};
  const out = await paymentIntentService.createPaymentIntent({
    userId: req.user.userId,
    role: req.user.role,
    kind: body.kind,
    jobId: body.jobId,
    materialOrderId: body.materialOrderId,
    amount: body.amount,
    provider: body.provider,
    returnUrl: body.returnUrl,
    cancelUrl: body.cancelUrl,
    metadata: body.metadata,
    cardId: body.cardId,
    cvv: body.cvv,
    idempotencyKey: req.financialIdempotencyKey,
    requestHash: req.financialRequestHash,
    route: req.financialIdempotencyRoute,
  });
  res.status(201).json({ success: true, ...out });
}

async function getPaymentIntent(req, res) {
  const intent = await paymentIntentService.getPaymentIntentById(
    req.params.id,
    req.user.userId,
    req.user.role
  );
  res.json({ success: true, intent });
}

async function confirmPaymentReturn(req, res) {
  const out = await paymentIntentService.confirmPaymentReturn(
    req.params.id,
    req.user.userId,
    req.user.role
  );
  res.json({ success: true, ...out });
}

async function adminForceSettle(req, res) {
  const out = await paymentIntentService.adminForceSettle(req.body?.intentId || req.params.id, req.user.userId);
  res.json({ success: true, ...out });
}

async function payfastWebhook(req, res) {
  res.status(200).send("OK");
  const data = req.body && typeof req.body === "object" ? req.body : {};
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress;
  webhookService.handlePayfastWebhook(data, clientIp).catch((e) => {
    console.error("[webhook payfast]", e);
  });
}

async function payflexWebhook(req, res) {
  const buf = req.body;
  if (!Buffer.isBuffer(buf)) {
    return res.status(400).json({ success: false, message: "Expected raw body" });
  }
  const sig = req.headers["x-payflex-signature"] || req.headers["x-signature"];
  const out = await webhookService.handlePayflexWebhook(buf, sig);
  const status = out.httpStatus != null ? out.httpStatus : 200;
  res.status(status).json({ success: status < 400, ...out });
}

async function payjustnowWebhook(req, res) {
  const buf = req.body;
  if (!Buffer.isBuffer(buf)) {
    return res.status(400).json({ success: false, message: "Expected raw body" });
  }
  const sig =
    req.headers["x-payjustnow-signature"] ||
    req.headers["x-signature"] ||
    req.headers["x-webhook-signature"];
  const out = await webhookService.handlePayjustnowWebhook(buf, sig);
  const status = out.httpStatus != null ? out.httpStatus : 200;
  res.status(status).json({ success: status < 400, ...out });
}

async function settlementWebhook(req, res) {
  const provider = String(req.params.provider || "").trim();
  const branchSettlement = require("../services/branchSettlement.service");
  const { marketplaceSettlementEnabled } = require("../services/payments/paymentConfig");

  if (!marketplaceSettlementEnabled()) {
    return res.status(501).json({ success: false, message: "Marketplace settlement is not enabled" });
  }

  let payload = req.body;
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString("utf8"));
    } catch {
      payload = {};
    }
  }

  try {
    const out = await branchSettlement.handleSettlementWebhook(provider, payload, req.headers);
    res.status(200).json({ success: true, ...out });
  } catch (e) {
    console.error(`[webhook settlement ${provider}]`, e);
    res.status(e.statusCode || 500).json({ success: false, message: e.message || "Settlement webhook failed" });
  }
}

module.exports = {
  getSavedCards,
  releaseEscrow,
  addCard,
  deleteCard,
  setDefaultCard,
  getInvoices,
  getInvoice,
  createInvoice,
  createRefundInvoice,
  listPaymentProviders,
  createPaymentIntent,
  getPaymentIntent,
  confirmPaymentReturn,
  adminForceSettle,
  payfastWebhook,
  payflexWebhook,
  payjustnowWebhook,
  settlementWebhook,
};
