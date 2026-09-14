import { describe, expect, it } from 'vitest';
import { getLegalDocument } from './content';
import {
  LEGAL_LABELS,
  LEGAL_LEGACY_REDIRECTS,
  LEGAL_ROUTES,
  LEGAL_VERSIONS,
  getRequiredDocuments,
} from './versions';
import { checkoutProcessorDisclosure } from './checkoutAcceptance';

function documentText(id: Parameters<typeof getLegalDocument>[0]): string {
  const doc = getLegalDocument(id);
  return [doc.title, doc.subtitle, ...doc.sections.flatMap((s) => [s.title, ...s.content])].join('\n');
}

describe('E3 live Paystack legal alignment', () => {
  it('Terms state payments use a third-party PSP and identify Paystack as current primary live processor', () => {
    const text = documentText('terms');
    expect(text).toMatch(/third-party payment service providers/i);
    expect(text).toMatch(/Paystack is currently EloFix's primary live payment processor/i);
  });

  it('Terms state EloFix is not a bank, deposit-taker, or escrow agent', () => {
    const text = documentText('terms');
    expect(text).toMatch(/not a bank, deposit-taker, wallet provider, insurer, or escrow agent/i);
    expect(text).toMatch(/does not hold Provider or Supplier settlement funds as customer deposits/i);
  });

  it('Payment Schedule contains 7% / 93% and successful payment is not bank settlement', () => {
    const text = documentText('escrow-policy');
    expect(text).toContain('7%');
    expect(text).toContain('93%');
    expect(text).toMatch(/Successful Customer payment does not mean immediate bank credit/i);
    expect(text).toMatch(/GROSS marketplace share/i);
    expect(getLegalDocument('escrow-policy').title).toBe('Payment Schedule and Transparency Policy');
    expect(LEGAL_LABELS['escrow-policy']).toBe('Payment Schedule and Transparency Policy');
  });

  it('Payment Schedule contains qualified T+2 working-day disclosure', () => {
    const text = documentText('escrow-policy');
    expect(text).toMatch(/generally T\+2 working days/i);
    expect(text).toMatch(/does not guarantee a specific bank-credit date/i);
    expect(text).not.toMatch(/will arrive in exactly two days/i);
  });

  it('Provider Agreement contains settlement timing and gross vs net disclosure', () => {
    const text = documentText('provider-agreement');
    expect(text).toMatch(/generally T\+2 working days/i);
    expect(text).toMatch(/GROSS share/i);
    expect(text).toMatch(/not necessarily the exact net amount/i);
    expect(text).toMatch(/does not normally send a second manual transfer/i);
    expect(text).toMatch(/Paystack verification of a payout destination is not the same as completed bank settlement/i);
  });

  it('Supplier Agreement contains settlement timing disclosure', () => {
    const text = documentText('supplier-agreement');
    expect(text).toMatch(/generally T\+2 working days/i);
    expect(text).toMatch(/does not promise instant Supplier settlement/i);
    expect(text).toMatch(/gross Supplier marketplace share/i);
  });

  it('Refund Policy documents asynchronous refunds and does not unconditionally bar 7% refunds', () => {
    const text = documentText('refund-policy');
    expect(text).toMatch(/Paystack refunds are asynchronous/i);
    expect(text).toMatch(/Approved does not mean money has already been returned/i);
    expect(text).toMatch(/up to approximately 10 business days/i);
    expect(text).toMatch(/ordinarily retained/i);
    expect(text).toMatch(/except where applicable law, card-scheme rules, payment-service-provider requirements or a binding determination/i);
    expect(text).not.toMatch(/The 7% platform fee is not refunded/i);
    expect(text).not.toMatch(/never refundable/i);
  });

  it('Privacy Policy names Paystack and still states no storage of full card number/CVV', () => {
    const text = documentText('privacy');
    expect(text).toMatch(/Paystack is currently EloFix's primary live payment processor/i);
    expect(text).toMatch(/does not store full card numbers or CVV\/CVC/i);
    expect(text).toMatch(/accounting, commission calculation, reconciliation, refunds/i);
  });

  it('Provider Verification distinguishes saved, connected, verified, and settled', () => {
    const text = documentText('provider-verification');
    expect(text).toMatch(/Banking information saved in EloFix/i);
    expect(text).toMatch(/Paystack payout destination or subaccount created/i);
    expect(text).toMatch(/Paystack payout destination verified/i);
    expect(text).toMatch(/Bank settlement completed/i);
    expect(text).toMatch(/are distinct and are not equivalent/i);
    expect(text).toMatch(/EloFix does not itself perform bank-account verification where Paystack performs payout-destination verification/i);
  });

  it('canonical /payment-schedule route renders the policy and /escrow-policy redirects', () => {
    expect(LEGAL_ROUTES['escrow-policy']).toBe('/payment-schedule');
    expect(LEGAL_LEGACY_REDIRECTS['/escrow-policy']).toBe('/payment-schedule');
    expect(getLegalDocument('escrow-policy').id).toBe('escrow-policy');
    expect(getLegalDocument('escrow-policy').title).toBe('Payment Schedule and Transparency Policy');
  });

  it('checkout disclosure names the selected processor without adding a new checkbox payload', () => {
    expect(checkoutProcessorDisclosure('PAYSTACK')).toMatch(
      /Payments are securely processed by Paystack\. EloFix does not store your full card number or CVV/
    );
    expect(checkoutProcessorDisclosure('PAYSTACK')).toMatch(/Refund and cancellation rules apply/);
    expect(checkoutProcessorDisclosure('PAYFAST')).toMatch(/processed by PayFast/);
    expect(checkoutProcessorDisclosure('PAYFAST')).not.toMatch(/Paystack/);
  });

  it('role-required documents still match the existing acceptance architecture', () => {
    expect(getRequiredDocuments('user')).toEqual(['terms', 'privacy']);
    expect(getRequiredDocuments('provider')).toEqual(['terms', 'privacy', 'provider-agreement', 'refund-policy']);
    expect(getRequiredDocuments('supplier')).toEqual([
      'terms',
      'privacy',
      'supplier-agreement',
      'supplier-participation',
    ]);
    expect(LEGAL_VERSIONS.terms).toBe('2026-09-14');
    expect(LEGAL_VERSIONS.privacy).toBe('2026-09-14');
    expect(LEGAL_VERSIONS.providerAgreement).toBe('2026-09-14');
    expect(LEGAL_VERSIONS.refundPolicy).toBe('2026-09-14');
    expect(LEGAL_VERSIONS.supplierAgreement).toBe('2026-09-14');
  });
});
