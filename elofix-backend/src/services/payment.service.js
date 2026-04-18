const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const { readState, updateState } = require("./jsonStore.service");

function maskLast4(number) {
  const digits = String(number || "").replace(/\D/g, "");
  return digits.slice(-4) || "0000";
}

function detectBrand(number) {
  const n = String(number || "");
  if (n.startsWith("34") || n.startsWith("37")) return "amex";
  if (n.startsWith("5")) return "mastercard";
  return "visa";
}

async function getSavedCards(userId) {
  const state = await readState();
  return state.cardsByUser?.[userId] || [];
}

async function addCard(userId, cardData) {
  const card = {
    id: randomUUID(),
    last4: maskLast4(cardData?.number),
    brand: detectBrand(cardData?.number),
    expiryMonth: Number(cardData?.expiryMonth || 1),
    expiryYear: Number(cardData?.expiryYear || new Date().getFullYear()),
    isDefault: false,
  };
  await updateState((state) => {
    const current = state.cardsByUser?.[userId] || [];
    const first = current.length === 0;
    const nextCard = { ...card, isDefault: first };
    state.cardsByUser = state.cardsByUser || {};
    state.cardsByUser[userId] = [...current, nextCard];
    return state;
  });
  const cards = await getSavedCards(userId);
  return cards[cards.length - 1];
}

async function deleteCard(userId, cardId) {
  await updateState((state) => {
    const current = state.cardsByUser?.[userId] || [];
    const next = current.filter((c) => c.id !== cardId);
    if (next.length > 0 && !next.some((c) => c.isDefault)) {
      next[0].isDefault = true;
    }
    state.cardsByUser = state.cardsByUser || {};
    state.cardsByUser[userId] = next;
    return state;
  });
}

async function setDefaultCard(userId, cardId) {
  await updateState((state) => {
    const current = state.cardsByUser?.[userId] || [];
    state.cardsByUser = state.cardsByUser || {};
    state.cardsByUser[userId] = current.map((c) => ({ ...c, isDefault: c.id === cardId }));
    return state;
  });
}

function normalizeInvoice(invoice) {
  return {
    id: invoice.id || randomUUID(),
    jobId: String(invoice.jobId || ""),
    userId: String(invoice.userId || ""),
    type: invoice.type || "materials",
    status: invoice.status || "paid",
    laborCost: invoice.laborCost != null ? Number(invoice.laborCost) : undefined,
    materialCost: invoice.materialCost != null ? Number(invoice.materialCost) : undefined,
    totalAmount: Number(invoice.totalAmount || 0),
    refundedAmount: invoice.refundedAmount != null ? Number(invoice.refundedAmount) : undefined,
    lineItems: Array.isArray(invoice.lineItems) ? invoice.lineItems : [],
    hardwareStores: Array.isArray(invoice.hardwareStores) ? invoice.hardwareStores : [],
    paymentMethod: invoice.paymentMethod || "Card",
    cardLast4: invoice.cardLast4 || undefined,
    paidAt: invoice.paidAt || new Date().toISOString(),
    createdAt: invoice.createdAt || new Date().toISOString(),
    driverName: invoice.driverName || undefined,
    vehicleInfo: invoice.vehicleInfo || undefined,
  };
}

async function createInvoice(payload) {
  const invoice = normalizeInvoice(payload || {});
  await updateState((state) => {
    state.invoices = [...(state.invoices || []), invoice];
    return state;
  });
  return invoice;
}

async function getInvoices(userId) {
  const state = await readState();
  return (state.invoices || []).filter((invoice) => invoice.userId === userId);
}

async function getInvoiceById(userId, invoiceId) {
  const invoices = await getInvoices(userId);
  return invoices.find((i) => i.id === invoiceId) || null;
}

async function createRefundInvoice(userId, jobId, laborRefund, materialsRefund, cardLast4) {
  const totalAmount = Number(laborRefund || 0) + Number(materialsRefund || 0);
  const invoice = normalizeInvoice({
    jobId,
    userId,
    type: "refund",
    status: "refunded",
    totalAmount,
    refundedAmount: totalAmount,
    lineItems: [
      { description: "Labor refund", quantity: 1, unitPrice: Number(laborRefund || 0), total: Number(laborRefund || 0) },
      {
        description: "Materials refund",
        quantity: 1,
        unitPrice: Number(materialsRefund || 0),
        total: Number(materialsRefund || 0),
      },
    ],
    paymentMethod: "Card",
    cardLast4,
  });
  await updateState((state) => {
    state.invoices = [...(state.invoices || []), invoice];
    return state;
  });
  return invoice;
}

async function assertCardExists(userId, cardId) {
  const cards = await getSavedCards(userId);
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new AppError("Card not found", 404);
  return card;
}

module.exports = {
  getSavedCards,
  addCard,
  deleteCard,
  setDefaultCard,
  getInvoices,
  getInvoiceById,
  createInvoice,
  createRefundInvoice,
  assertCardExists,
};
