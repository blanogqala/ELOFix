const paymentService = require("../services/payment.service");

async function getSavedCards(req, res) {
  const userId = req.query.userId || req.user.userId;
  const cards = await paymentService.getSavedCards(String(userId));
  res.json({ success: true, cards });
}

async function addCard(req, res) {
  const userId = req.body?.userId || req.user.userId;
  const card = await paymentService.addCard(String(userId), req.body || {});
  res.status(201).json({ success: true, card });
}

async function deleteCard(req, res) {
  const userId = req.query.userId || req.user.userId;
  await paymentService.deleteCard(String(userId), req.params.cardId);
  res.json({ success: true });
}

async function setDefaultCard(req, res) {
  const userId = req.body?.userId || req.user.userId;
  await paymentService.setDefaultCard(String(userId), req.params.cardId);
  res.json({ success: true });
}

async function getInvoices(req, res) {
  const userId = req.query.userId || req.user.userId;
  const invoices = await paymentService.getInvoices(String(userId));
  res.json({ success: true, invoices });
}

async function getInvoice(req, res) {
  const userId = req.query.userId || req.user.userId;
  const invoice = await paymentService.getInvoiceById(String(userId), req.params.invoiceId);
  res.json({ success: true, invoice });
}

async function createInvoice(req, res) {
  const invoice = await paymentService.createInvoice(req.body || {});
  res.status(201).json({ success: true, invoice });
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

module.exports = {
  getSavedCards,
  addCard,
  deleteCard,
  setDefaultCard,
  getInvoices,
  getInvoice,
  createInvoice,
  createRefundInvoice,
};
