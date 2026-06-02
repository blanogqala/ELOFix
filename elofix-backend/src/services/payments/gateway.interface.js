/**
 * @typedef {object} CheckoutSession
 * @property {'redirect'} type
 * @property {string} url
 * @property {Record<string, string>} [formFields] - POST form fields (PayFast)
 * @property {'POST'|'GET'} [method]
 */

/**
 * @typedef {object} WebhookVerifyResult
 * @property {boolean} valid
 * @property {string} [merchantReference]
 * @property {string} [gatewayTransactionId]
 * @property {'PAID'|'FAILED'|'CANCELLED'|'PROCESSING'} [state]
 * @property {number} [amount]
 * @property {string} [externalEventId]
 * @property {object} [raw]
 */

module.exports = {};
