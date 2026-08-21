import { describe, it, expect } from 'vitest';
import { COMPANY } from './company';
import { getAllLegalDocuments, getLegalDocument } from './legal/content';
import { LEGAL_LABELS, LEGAL_ROUTES, LEGAL_VERSIONS, getRequiredDocuments } from './legal/versions';

const BANNED_EMAILS = [
  'support@elofix.com',
  'privacy@elofix.com',
  'legal@elofix.com',
  'support@elofix.co.za',
  'finance@litiholdings.co.za',
];

function documentText(doc: ReturnType<typeof getLegalDocument>): string {
  return [doc.title, doc.subtitle, ...doc.sections.flatMap((section) => [section.title, ...section.content])].join(
    '\n',
  );
}

describe('legal identity and public documents', () => {
  it('does not describe EloFix as a separately incorporated Pty Ltd', () => {
    for (const doc of getAllLegalDocuments()) {
      const text = documentText(doc);
      expect(text, doc.id).not.toContain('EloFix (Pty) Ltd');
      expect(text, doc.id).not.toMatch(/EloFix\s+\(Pty\)/i);
    }
  });

  it('does not publish unconfirmed @elofix.com mailboxes', () => {
    for (const doc of getAllLegalDocuments()) {
      const text = documentText(doc);
      for (const email of BANNED_EMAILS) {
        expect(text, `${doc.id} ${email}`).not.toContain(email);
      }
    }
  });

  it('uses the shared legal/business email on published legal documents', () => {
    const withContact = getAllLegalDocuments().filter((doc) =>
      doc.sections.some((section) => section.content.some((line) => line.includes('@'))),
    );
    expect(withContact.length).toBeGreaterThan(0);
    for (const doc of withContact) {
      expect(documentText(doc), doc.id).toContain(COMPANY.email);
    }
  });

  it('names LITI Holdings as the operator on core public policies', () => {
    for (const id of ['terms', 'privacy', 'refund-policy', 'delivery-policy', 'provider-agreement', 'supplier-agreement'] as const) {
      expect(documentText(getLegalDocument(id))).toContain(COMPANY.legalName);
    }
  });

  it('publishes delivery policy and expanded refund title', () => {
    expect(LEGAL_ROUTES['delivery-policy']).toBe('/delivery-policy');
    expect(LEGAL_LABELS['delivery-policy']).toBe('Delivery & Collection Policy');
    expect(LEGAL_LABELS['refund-policy']).toBe('Refund, Returns & Cancellation Policy');
    expect(getLegalDocument('refund-policy').title).toBe('Refund, Returns & Cancellation Policy');
    expect(getLegalDocument('delivery-policy').title).toBe('Delivery & Collection Policy');
  });

  it('bumps material workflow documents to 2026-08-18-r2 and does not require delivery policy at signup', () => {
    expect(LEGAL_VERSIONS.terms).toBe('2026-08-18-r2');
    expect(LEGAL_VERSIONS.refundPolicy).toBe('2026-08-18-r2');
    expect(LEGAL_VERSIONS.deliveryPolicy).toBe('2026-08-18-r2');
    expect(LEGAL_VERSIONS.privacy).toBe('2026-08-18');
    expect(getRequiredDocuments('user')).not.toContain('delivery-policy');
    expect(getRequiredDocuments('provider')).not.toContain('delivery-policy');
    expect(getRequiredDocuments('supplier')).not.toContain('delivery-policy');
  });
});
