const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");

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
  const rows = await prisma.savedCard.findMany({
    where: { userId: String(userId) },
    orderBy: { id: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    last4: c.last4,
    brand: c.brand,
    expiryMonth: c.expiryMonth,
    expiryYear: c.expiryYear,
    isDefault: c.isDefault,
  }));
}

async function addCard(userId, cardData) {
  const uid = String(userId);
  const card = {
    id: randomUUID(),
    last4: maskLast4(cardData?.number),
    brand: detectBrand(cardData?.number),
    expiryMonth: Number(cardData?.expiryMonth || 1),
    expiryYear: Number(cardData?.expiryYear || new Date().getFullYear()),
    isDefault: false,
  };

  await prisma.$transaction(async (tx) => {
    const count = await tx.savedCard.count({ where: { userId: uid } });
    const isDefault = count === 0;
    await tx.savedCard.create({
      data: {
        id: card.id,
        userId: uid,
        last4: card.last4,
        brand: card.brand,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault,
      },
    });
  });

  const cards = await getSavedCards(uid);
  return cards.find((c) => c.id === card.id);
}

async function deleteCard(userId, cardId) {
  const uid = String(userId);
  await prisma.$transaction(async (tx) => {
    await tx.savedCard.deleteMany({ where: { userId: uid, id: cardId } });
    const remaining = await tx.savedCard.findMany({ where: { userId: uid }, orderBy: { id: "asc" } });
    if (remaining.length > 0 && !remaining.some((c) => c.isDefault)) {
      await tx.savedCard.update({
        where: { id: remaining[0].id },
        data: { isDefault: true },
      });
    }
  });
}

async function setDefaultCard(userId, cardId) {
  const uid = String(userId);
  await prisma.$transaction(async (tx) => {
    await tx.savedCard.updateMany({
      where: { userId: uid },
      data: { isDefault: false },
    });
    await tx.savedCard.updateMany({
      where: { userId: uid, id: cardId },
      data: { isDefault: true },
    });
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
  await prisma.invoice.create({
    data: {
      id: invoice.id,
      userId: invoice.userId,
      jobId: invoice.jobId || null,
      payload: invoice,
    },
  });
  return invoice;
}

async function getInvoices(userId) {
  const rows = await prisma.invoice.findMany({
    where: { userId: String(userId) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => (r.payload && typeof r.payload === "object" ? r.payload : {}));
}

async function getInvoiceById(userId, invoiceId) {
  const row = await prisma.invoice.findFirst({
    where: { userId: String(userId), id: invoiceId },
  });
  if (!row) return null;
  return row.payload && typeof row.payload === "object" ? row.payload : null;
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
  await prisma.invoice.create({
    data: {
      id: invoice.id,
      userId: invoice.userId,
      jobId: invoice.jobId || null,
      payload: invoice,
    },
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
