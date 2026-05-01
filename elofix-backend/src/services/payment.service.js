const { randomUUID, createHmac, timingSafeEqual } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const earningService = require("./earning.service");
const { mutateJobMetaInTransaction, getJobMeta } = require("./jobMeta.service");
const { idempotencyGate, idempotencyCommit } = require("../utils/idempotencyTransaction");

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

// ---------------------------------------------------------------------------
// Labor escrow: 7% commission, 50% of provider share released immediately, 50% on user confirm-completion
// Money rounding: commission = round half-up 2dp on 7% of gross; provider = gross - commission.
// Paystack: set PAYSTACK_SECRET_KEY; optional PAYSTACK_CURRENCY=NGN. Verify + webhook use amount/100 (major units).
// Cancel-refund: computeCancelRefundAmount is for book/ UI; real Paystack refunds are not called automatically.
// ---------------------------------------------------------------------------

function toPrismaDecimal(v) {
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(String(v));
}

/**
 * commissionAmount = total × 0.07, providerTotal = total × 0.93 (each rounded half-up 2dp).
 * @returns {{ commissionAmount: Prisma.Decimal, providerAmount: Prisma.Decimal }}
 */
function splitLaborTotalGross(gross) {
  const t = toPrismaDecimal(gross);
  const commissionAmount = t.mul(0.07).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const providerAmount = t.mul(0.93).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { commissionAmount, providerAmount };
}

/**
 * firstRelease = providerTotal × 0.5, secondRelease = providerTotal − first (2dp each).
 */
function splitProviderTranches(providerTotal) {
  const p = toPrismaDecimal(providerTotal);
  const firstTranche = p.mul(0.5).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const secondTranche = p.sub(firstTranche).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { firstTranche, secondTranche };
}

function isEscrowV2Job(job) {
  return job != null && job.providerAmount != null && job.totalPrice != null;
}

function getPaystackSecret() {
  const s = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!s) {
    throw new AppError("PAYSTACK_SECRET_KEY is not configured", 500);
  }
  return s;
}

/**
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader
 */
function verifyPaystackSignature(rawBody, signatureHeader) {
  const expected = String(signatureHeader || "").trim();
  if (!expected) return false;
  const hash = createHmac("sha512", getPaystackSecret())
    .update(rawBody)
    .digest("hex");
  if (expected.length !== hash.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(hash, "utf8"));
}

/**
 * @param {string} reference
 * @returns {Promise<object>} Paystack API `data` object
 */
async function fetchPaystackTransactionVerify(reference) {
  const ref = encodeURIComponent(String(reference || "").trim());
  if (!ref) {
    throw new AppError("reference is required", 400);
  }
  const res = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${getPaystackSecret()}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new AppError(json?.message || "Paystack verify failed", 502);
  }
  if (!json.data) {
    throw new AppError("Invalid Paystack response", 502);
  }
  return json.data;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {object} args
 * @param {string} args.jobId
 * @param {string} args.customerUserId
 * @param {string} args.providerProfileId - Provider table id
 * @param {import("@prisma/client").Prisma.Decimal} args.gross
 * @param {string} args.paymentRef
 * @param {string} args.paidAt
 * @param {string} args.cardLast4
 * @param {string} args.idempotencyKeyForEarnings
 * @param {string} args.channel
 * @param {object} args.job
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function runSettleLaborInTransaction(
  tx,
  {
    job,
    jobId,
    customerUserId,
    providerProfileId,
    gross,
    paymentRef,
    paidAt,
    cardLast4,
    idempotencyKeyForEarnings,
    channel,
  }
) {
  const t = toPrismaDecimal(gross);
  if (t.lte(0)) {
    throw new AppError("Invalid payment amount", 400);
  }
  if (String(job.laborPaid) === "true" || job.laborPaid === true) {
    throw new AppError("Labor already paid", 400);
  }
  if (!job.providerId) {
    throw new AppError("Job has no provider", 400);
  }

  const { commissionAmount, providerAmount } = splitLaborTotalGross(t);
  const { firstTranche, secondTranche } = splitProviderTranches(providerAmount);

  const t1Key = idempotencyKeyForEarnings ? `${idempotencyKeyForEarnings}::t1` : `t1-${jobId}-${paymentRef}`;

  const existingLedger = await tx.commissionLedger.findUnique({ where: { jobId } });
  if (existingLedger) {
    throw new AppError("Commission already recorded for this job", 400);
  }
  await tx.commissionLedger.create({
    data: {
      id: randomUUID(),
      jobId,
      amount: commissionAmount,
      source: "labor_payment",
      totalPrice: t,
      currency: String(process.env.PAYSTACK_CURRENCY || "NGN"),
    },
  });

  const meta = await mutateJobMetaInTransaction(tx, jobId, (m) => ({
    ...m,
    hasStarted: true,
    laborPaid: true,
    servicePayment: {
      status: "paid",
      amount: Number(t),
      paidAt,
      paymentRef,
      paidBy: customerUserId,
      channel: String(channel),
      maskedPaymentMethod: `**** **** **** ${cardLast4 || "****"}`,
    },
    escrow: {
      heldAmount: Number(secondTranche),
      releasedAmount: Number(firstTranche),
    },
    statusOverride: "SERVICE_PAID",
  }));

  const jobStatus = job.status;
  const statusPatch =
    jobStatus === "ACCEPTED" ? { status: "IN_PROGRESS", laborPaid: true } : { laborPaid: true };

  const jobRow = await tx.job.update({
    where: { id: jobId },
    data: {
      ...statusPatch,
      totalPrice: t,
      providerAmount,
      commissionAmount,
      releasedAmount: firstTranche,
      isFullyReleased: false,
      paymentReleased: false,
      escrowSecondReleaseDone: false,
    },
  });

  // Pending = full provider share; first 50% immediately goes available
  await earningService.createLaborCreditPending(tx, {
    providerId: providerProfileId,
    jobId,
    amount: Number(providerAmount),
    idempotencyKey: null,
  });

  await earningService.applyReleaseToLedger(tx, {
    providerId: providerProfileId,
    jobId,
    releaseAmount: Number(firstTranche),
    idempotencyKey: t1Key,
  });

  return { jobRow, meta, commissionAmount, providerAmount, firstTranche, secondTranche };
}

/**
 * Second 50% of provider funds after user confirm-completion.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function runSecondTrancheInTransaction(tx, { job, providerProfileId, jobId }) {
  if (!job.laborPaid) {
    return { skipped: true, jobRow: null };
  }
  if (job.escrowSecondReleaseDone) {
    return { skipped: true, jobRow: null };
  }
  if (job.paymentReleased === true && job.isFullyReleased) {
    return { skipped: true, jobRow: null };
  }
  if (job.isFullyReleased) {
    return { skipped: true, jobRow: null };
  }
  if (!isEscrowV2Job(job) || !job.providerAmount) {
    return { skipped: true, jobRow: null };
  }
  if (String(job.status) === "CANCELLED") {
    return { skipped: true, jobRow: null };
  }

  const providerAmt = toPrismaDecimal(job.providerAmount);
  const released = toPrismaDecimal(job.releasedAmount || 0);
  const remaining = providerAmt.sub(released);
  if (remaining.lte(0)) {
    const jobRow = await tx.job.update({
      where: { id: jobId },
      data: { isFullyReleased: true, paymentReleased: true, escrowSecondReleaseDone: true },
    });
    return { skipped: true, jobRow };
  }

  const r2Key = `escrow-2nd:${jobId}`;

  await earningService.applyReleaseToLedger(tx, {
    providerId: providerProfileId,
    jobId,
    releaseAmount: Number(remaining),
    idempotencyKey: r2Key,
  });

  const nextReleased = released.add(remaining);
  const meta2 = await mutateJobMetaInTransaction(tx, jobId, (m) => ({
    ...m,
    escrow: { heldAmount: 0, releasedAmount: Number(providerAmt) },
  }));

  const jobRow = await tx.job.update({
    where: { id: jobId },
    data: {
      releasedAmount: nextReleased,
      isFullyReleased: true,
      paymentReleased: true,
      escrowSecondReleaseDone: true,
    },
  });

  return { skipped: false, jobRow, meta2 };
}

/**
 * @param {import("@prisma/client").Job} job
 */
function computeCancelRefundAmount(job) {
  if (!job.laborPaid) {
    return 0;
  }
  if (!isEscrowV2Job(job) || !job.totalPrice) {
    return Number(job.price) || 0;
  }
  const total = toPrismaDecimal(job.totalPrice);
  const releasedToProvider = toPrismaDecimal(job.releasedAmount || 0);
  // No funds released to provider yet → 100% of gross to customer; platform does not keep commission in mock path.
  if (releasedToProvider.lte(0)) {
    return Number(total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
  }
  // After at least one tranche: refund only **remaining provider escrow** (not gross − released which would mis-count commission).
  const providerTotal = toPrismaDecimal(job.providerAmount);
  const remainingProviderEscrow = providerTotal
    .sub(releasedToProvider)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (remainingProviderEscrow.lte(0)) {
    return 0;
  }
  return Number(remainingProviderEscrow);
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function runCancelJobFinancialsInTransaction(tx, { job, providerProfileId }) {
  if (!job.laborPaid) {
    return { refundAmount: 0, cleanedEarnings: 0, refundKind: "none" };
  }
  if (!isEscrowV2Job(job)) {
    return { refundAmount: computeCancelRefundAmount(job), cleanedEarnings: 0, refundKind: "legacy" };
  }

  const refundAmount = computeCancelRefundAmount(job);
  const released = toPrismaDecimal(job.releasedAmount || 0);
  if (released.lte(0)) {
    await tx.earning.deleteMany({ where: { jobId: job.id } });
    await tx.commissionLedger.deleteMany({ where: { jobId: job.id } });
    return { refundAmount, cleanedEarnings: 1, refundKind: "full" };
  }
  await tx.earning.deleteMany({
    where: { jobId: job.id, type: "credit", status: "pending" },
  });
  // Released (available) credits are never auto-reversed; commission row kept on partial cancel.
  return { refundAmount, cleanedEarnings: 1, refundKind: "partial_escrow" };
}

function expectedLaborGrossFromJob(job, meta) {
  if (meta?.servicePrice != null && typeof meta.servicePrice === "object" && meta.servicePrice.amount != null) {
    return toPrismaDecimal(meta.servicePrice.amount);
  }
  return toPrismaDecimal(job.price);
}

function isPaystackConfigured() {
  return Boolean(String(process.env.PAYSTACK_SECRET_KEY || "").trim());
}

/**
 * After Paystack verify API — customer id must match job; amount must match service price.
 */
async function verifyPaystackAndSettleLabor({
  jobId,
  customerUserId,
  reference,
  idempotencyKey,
  requestHash,
  route,
}) {
  if (!isPaystackConfigured()) {
    throw new AppError("Paystack is not configured", 503);
  }
  const pData = await fetchPaystackTransactionVerify(reference);
  if (String(pData.status).toLowerCase() !== "success") {
    throw new AppError("Transaction not successful", 400);
  }
  const amountMajor = toPrismaDecimal(pData.amount).div(100);
  const last4Use = String(pData.authorization?.last4 || "****");
  const metaIn = pData.metadata || {};
  const metaJobId = metaIn.jobId || metaIn.job_id;
  if (metaJobId && String(metaJobId) !== String(jobId)) {
    throw new AppError("Payment does not match this job", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      const gate = await idempotencyGate(tx, { idempotencyKey, requestHash, route });
      if (gate.replay) {
        const j = await tx.job.findUnique({ where: { id: jobId } });
        return { replay: true, job: j, alreadySettled: false };
      }
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) {
        throw new AppError("Job not found", 404);
      }
      if (String(job.customerId) !== String(customerUserId)) {
        throw new AppError("Forbidden", 403);
      }
      if (job.laborPaid) {
        await idempotencyCommit(tx, { idempotencyKey, requestHash, route });
        return { replay: false, job, alreadySettled: true };
      }
      const meta = await getJobMeta(jobId);
      const expected = expectedLaborGrossFromJob(job, meta);
      const diff = amountMajor.sub(expected).abs();
      if (diff.gt(0.02)) {
        throw new AppError("Paid amount does not match job price", 400);
      }
      if (!job.providerId) {
        throw new AppError("Job has no provider", 400);
      }
      const prov = await tx.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } });
      if (!prov) {
        throw new AppError("Provider profile not found", 404);
      }
      const paidAt =
        pData.paid_at || pData.paidAt || pData.transaction_date || new Date().toISOString();
      await runSettleLaborInTransaction(tx, {
        job,
        jobId,
        customerUserId,
        providerProfileId: prov.id,
        gross: amountMajor,
        paymentRef: String(reference),
        paidAt: typeof paidAt === "string" ? paidAt : new Date().toISOString(),
        cardLast4: last4Use,
        idempotencyKeyForEarnings: idempotencyKey,
        channel: "paystack",
      });
      const existingPc = await tx.paystackCharge.findUnique({
        where: { paystackReference: String(reference) },
      });
      if (!existingPc) {
        await tx.paystackCharge.create({
          data: {
            id: randomUUID(),
            jobId,
            paystackReference: String(reference),
            status: "success",
            amountZar: amountMajor,
            paystackTransId: pData.id != null ? String(pData.id) : null,
          },
        });
      }
      await idempotencyCommit(tx, { idempotencyKey, requestHash, route });
      const updated = await tx.job.findUnique({ where: { id: jobId } });
      return { replay: false, job: updated, alreadySettled: false };
    },
    {
      maxWait: 5000,
      timeout: 20000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

/**
 * @param {Buffer} rawBody
 */
async function processPaystackWebhookBuffer(rawBuffer, signatureHeader) {
  if (!isPaystackConfigured()) {
    return { httpStatus: 503, message: "Paystack is not configured" };
  }
  if (!verifyPaystackSignature(rawBuffer, signatureHeader)) {
    return { httpStatus: 400, message: "Invalid signature" };
  }
  let body;
  try {
    body = JSON.parse(rawBuffer.toString("utf8"));
  } catch {
    return { httpStatus: 400, message: "Invalid JSON" };
  }
  if (String(body.event || "") !== "charge.success") {
    return { httpStatus: 200, message: "ignored" };
  }
  const d = body.data;
  if (!d || !d.reference) {
    return { httpStatus: 200, message: "no data" };
  }
  const eventId = d.id != null ? String(d.id) : `ref:${d.reference}`;

  let pData;
  try {
    pData = await fetchPaystackTransactionVerify(d.reference);
  } catch (e) {
    if (e instanceof AppError) {
      return { httpStatus: e.statusCode || 502, message: e.message };
    }
    throw e;
  }
  if (String(pData.status).toLowerCase() !== "success") {
    return { httpStatus: 200, message: "not success" };
  }
  const amountMajor = toPrismaDecimal(pData.amount).div(100);
  const last4 = String(pData.authorization?.last4 || "****");
  const jobId = (pData.metadata && (pData.metadata.jobId || pData.metadata.job_id)) || null;
  if (!jobId) {
    return { httpStatus: 200, message: "no job in metadata" };
  }

  try {
    const inner = await prisma.$transaction(
      async (tx) => {
        const existingEv0 = await tx.paystackWebhookEvent.findUnique({ where: { eventId } });
        if (existingEv0) {
          return { processed: true, duplicate: true };
        }
        const chargeByRef = await tx.paystackCharge.findUnique({
          where: { paystackReference: String(d.reference) },
        });
        if (chargeByRef && String(chargeByRef.status) === "success") {
          const jRef = await tx.job.findUnique({ where: { id: String(jobId) } });
          if (jRef && jRef.laborPaid) {
            try {
              await tx.paystackWebhookEvent.create({
                data: { id: randomUUID(), eventId },
              });
            } catch (e) {
              if (e && e.code === "P2002") {
                return { processed: true, duplicate: true };
              }
              throw e;
            }
            return { processed: true, duplicate: true, idempotentByReference: true };
          }
        }
        const job = await tx.job.findUnique({ where: { id: String(jobId) } });
        if (!job) {
          return { processed: true, noJob: true };
        }
        if (job.laborPaid) {
          try {
            await tx.paystackWebhookEvent.create({
              data: { id: randomUUID(), eventId },
            });
          } catch (e) {
            if (e && e.code === "P2002") {
              return { processed: true, duplicate: true, alreadySettled: true };
            }
            throw e;
          }
          return { processed: true, duplicate: true, alreadySettled: true };
        }
        if (!job.providerId) {
          return { processed: true, noProvider: true };
        }
        const prov = await tx.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } });
        if (!prov) {
          return { processed: true, noProvider: true };
        }
        const meta = await getJobMeta(jobId);
        const expected = expectedLaborGrossFromJob(job, meta);
        const diff = amountMajor.sub(expected).abs();
        if (diff.gt(0.02)) {
          throw new AppError("Paid amount does not match job price", 400);
        }
        const paidAt = pData.paid_at || pData.paidAt || new Date().toISOString();
        await runSettleLaborInTransaction(tx, {
          job,
          jobId: String(jobId),
          customerUserId: job.customerId,
          providerProfileId: prov.id,
          gross: amountMajor,
          paymentRef: String(d.reference),
          paidAt: typeof paidAt === "string" ? paidAt : new Date().toISOString(),
          cardLast4: last4,
          idempotencyKeyForEarnings: `webhook-t1-${d.reference}`,
          channel: "paystack",
        });
        const existingPc = await tx.paystackCharge.findUnique({
          where: { paystackReference: String(d.reference) },
        });
        if (!existingPc) {
          await tx.paystackCharge.create({
            data: {
              id: randomUUID(),
              jobId: String(jobId),
              paystackReference: String(d.reference),
              status: "success",
              amountZar: amountMajor,
              paystackTransId: pData.id != null ? String(pData.id) : null,
            },
          });
        }
        try {
          await tx.paystackWebhookEvent.create({
            data: { id: randomUUID(), eventId },
          });
        } catch (e) {
          if (e && e.code === "P2002") {
            return { processed: true, duplicate: true };
          }
          throw e;
        }
        return { processed: true, duplicate: false };
      },
      {
        maxWait: 5000,
        timeout: 20000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
    return { httpStatus: 200, result: inner };
  } catch (e) {
    if (e instanceof AppError) {
      return { httpStatus: e.statusCode || 400, message: e.message };
    }
    throw e;
  }
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
  // escrow / Paystack
  toPrismaDecimal,
  splitLaborTotalGross,
  splitProviderTranches,
  isEscrowV2Job,
  verifyPaystackSignature,
  fetchPaystackTransactionVerify,
  runSettleLaborInTransaction,
  runSecondTrancheInTransaction,
  computeCancelRefundAmount,
  runCancelJobFinancialsInTransaction,
  getPaystackSecret,
  isPaystackConfigured,
  expectedLaborGrossFromJob,
  verifyPaystackAndSettleLabor,
  processPaystackWebhookBuffer,
};
