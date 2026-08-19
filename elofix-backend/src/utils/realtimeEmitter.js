/**
 * EloFix Realtime Domain Event Emitter
 *
 * Emits a standardised `domain:update` Socket.IO event to all affected user/branch rooms
 * after a successful database mutation.
 *
 * SAFETY RULES:
 * - Never throws — socket failures must not roll back a completed financial transaction.
 * - Silently no-ops when global.io is not initialised (unit-test safe).
 * - Payload never carries financial amounts, card data, KYC docs, or gateway secrets.
 * - Events are invalidation signals only; the frontend must refetch authoritative REST state.
 */

/**
 * @typedef {Object} DomainUpdateOptions
 * @property {string} domain           - Domain name: 'job' | 'payment' | 'dispute' | 'refund' | 'material-order' | 'delivery' | 'notification' | 'earnings' | 'profile' | 'supplier' | 'admin'
 * @property {string} action           - Action: 'created' | 'updated' | 'status-changed' | 'paid' | 'completed' | 'cancelled' | 'resolved' | 'restricted' | 'unrestricted' | ...
 * @property {string} [entityId]       - Primary entity ID (dispute ID, order ID, etc.)
 * @property {string} [jobId]          - Job ID when event relates to a job
 * @property {string} [orderId]        - Material order ID when applicable
 * @property {string} [disputeId]      - Dispute ID when applicable
 * @property {string[]} [userIds]      - Target user room IDs (deduped automatically)
 * @property {string[]} [branchIds]    - Target branch room IDs
 * @property {boolean} [adminRoom]     - If true, also emit to the 'admin' room
 * @property {Object} [metadata]       - Minimal non-sensitive additional identifiers
 */

/**
 * Emit a domain:update event to all affected rooms.
 * Safe to call from inside or outside a database transaction — always after commit.
 *
 * @param {DomainUpdateOptions} opts
 */
function emitDomainUpdate(opts) {
  try {
    if (!global.io) return;

    const {
      domain,
      action,
      entityId,
      jobId,
      orderId,
      disputeId,
      userIds = [],
      branchIds = [],
      adminRoom = false,
      metadata = {},
    } = opts || {};

    if (!domain || !action) {
      console.warn("[realtimeEmitter] emitDomainUpdate called without domain or action — skipping");
      return;
    }

    const payload = {
      domain: String(domain),
      action: String(action),
      ...(entityId != null ? { entityId: String(entityId) } : {}),
      ...(jobId != null ? { jobId: String(jobId) } : {}),
      ...(orderId != null ? { orderId: String(orderId) } : {}),
      ...(disputeId != null ? { disputeId: String(disputeId) } : {}),
      timestamp: new Date().toISOString(),
      ...(metadata && typeof metadata === "object" ? { metadata } : {}),
    };

    // Deduplicate user IDs
    const uniqueUserIds = [...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => (id != null ? String(id).trim() : ""))
        .filter(Boolean)
    )];

    for (const userId of uniqueUserIds) {
      try {
        global.io.to(userId).emit("domain:update", payload);
      } catch (e) {
        console.error(`[realtimeEmitter] emit to user room '${userId}' failed:`, e?.message || e);
      }
    }

    // Branch rooms
    const uniqueBranchIds = [...new Set(
      (Array.isArray(branchIds) ? branchIds : [])
        .map((id) => (id != null ? String(id).trim() : ""))
        .filter(Boolean)
    )];

    for (const branchId of uniqueBranchIds) {
      try {
        global.io.to(`branch:${branchId}`).emit("domain:update", payload);
      } catch (e) {
        console.error(`[realtimeEmitter] emit to branch room '${branchId}' failed:`, e?.message || e);
      }
    }

    // Admin room (only if explicitly requested)
    if (adminRoom) {
      try {
        global.io.to("admin").emit("domain:update", payload);
      } catch (e) {
        console.error("[realtimeEmitter] emit to admin room failed:", e?.message || e);
      }
    }
  } catch (outerErr) {
    // Top-level safety net — never propagate socket errors to callers
    console.error("[realtimeEmitter] unexpected error in emitDomainUpdate:", outerErr?.message || outerErr);
  }
}

module.exports = { emitDomainUpdate };
