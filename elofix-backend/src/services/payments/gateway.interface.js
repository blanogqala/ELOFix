/**
 * Payment gateway adapter contract (PayFast / Payflex / PayJustNow / future).
 *
 * Unified marketplace payout methods (gateway-agnostic names):
 * - supportsMarketplaceSettlement()
 * - createPayoutDestination(profile)
 * - updatePayoutDestination(recipientId, profile)
 * - deactivatePayoutDestination(recipientId)
 * - getPayoutDestinationStatus(recipientId)
 * - createProviderSettlement(intent, destination)
 * - createSupplierSettlement(intent, destination)
 * - getSettlementStatus(settlementId)
 * - verifySettlementWebhook(payload, headers)
 *
 * Branch aliases (legacy): createBranchPayoutDestination → createPayoutDestination
 *
 * DO NOT invent undocumented gateway HTTP APIs. If refund or settlement is unsupported,
 * return { supported: false, requiresManualAction: true }.
 */

module.exports = {};
