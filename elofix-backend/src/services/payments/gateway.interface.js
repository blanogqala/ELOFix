/**
 * Payment gateway adapter contract (PayFast / Payflex / PayJustNow / future hosted checkout e.g. Peach).
 *
 * ## Hosted checkout (required production direction)
 *
 * Adapters MUST collect sensitive card credentials only on the PSP-hosted page.
 * EloFix MUST NOT pass PAN / CVV / CVC / expiry into createCheckout.
 *
 * Conceptual contract:
 *
 *   createCheckout({
 *     paymentIntent,   // amount, currency, merchantReference, kind, returnUrl, cancelUrl, id
 *     customer,        // name, email, phone (non-sensitive)
 *     // returnUrl / cancelUrl / webhookUrl may also come from env + intent fields
 *   })
 *
 *   → {
 *     type: 'redirect',
 *     url: checkoutUrl,           // HTTPS redirect / form action
 *     formFields?: {...},         // optional POST fields (e.g. PayFast)
 *     method?: 'GET' | 'POST',
 *     providerReference?: string, // optional PSP checkout / transaction id
 *     status?: string,
 *   }
 *
 * Existing adapters (PayFast / Payflex / PayJustNow) already follow this shape via
 * createCheckout(intent, customer) — keep field names as implemented.
 *
 * Future Peach Hosted Checkout should plug into the same createCheckout surface
 * without reintroducing raw card handling in EloFix. Tokenisation (registrationId)
 * is a later phase; do not invent fake tokens here.
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
 *
 * ## Future saved payment methods (NOT implemented yet)
 *
 * Customer → PSP hosted checkout → optional save consent → PSP stores credentials →
 * PSP returns registrationId/token → EloFix stores token + masked metadata only.
 * EloFix never reconstructs or stores original PAN/CVC.
 */

module.exports = {};
