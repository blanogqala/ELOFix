-- Allow multiple payment intents per material order (materials + delivery fee),
-- while still preventing duplicate intents of the same kind for an order.

-- Drop the single-column uniqueness on materialOrderId.
DROP INDEX "PaymentIntent_materialOrderId_key";

-- Composite uniqueness: at most one intent per (materialOrderId, kind).
-- NULL materialOrderId rows (e.g. LABOR intents) remain unaffected (NULLs are distinct).
CREATE UNIQUE INDEX "PaymentIntent_materialOrderId_kind_key" ON "PaymentIntent"("materialOrderId", "kind");
