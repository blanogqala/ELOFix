const { randomUUID } = require("crypto");
const AppError = require("./AppError");

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ idempotencyKey: string, requestHash: string, route: string }} args
 * @returns {Promise<{ replay: boolean }>}
 */
async function idempotencyGate(tx, { idempotencyKey, requestHash, route }) {
  const row = await tx.idempotencyRecord.findUnique({
    where: { idempotencyKey },
  });
  if (row) {
    if (row.requestHash !== requestHash) {
      throw new AppError("Idempotency key reused with different payload", 409, "E_IDEMPOTENCY_CONFLICT");
    }
    return { replay: true };
  }
  return { replay: false };
}

/**
 * Call only after successful financial writes in the same transaction.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function idempotencyCommit(tx, { idempotencyKey, requestHash, route }) {
  await tx.idempotencyRecord.create({
    data: {
      id: randomUUID(),
      idempotencyKey,
      requestHash,
      route,
    },
  });
}

module.exports = { idempotencyGate, idempotencyCommit };
