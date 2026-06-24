import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';

const EFFECTIVE = 'June 24, 2026';

export const supplierAgreement: LegalDocument = {
  id: 'supplier-agreement',
  title: 'Supplier Agreement',
  subtitle: 'Terms for businesses supplying materials through the EloFix marketplace.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.supplierAgreement,
  sections: [
    {
      id: 'relationship',
      title: '1. Independent Supplier Relationship',
      content: [
        'This Supplier Agreement supplements the EloFix Terms of Service for businesses that register as Suppliers on EloFix (Pty) Ltd.',
        'You are an independent business and not an employee, agent, joint venturer, or partner of EloFix.',
        'You are solely responsible for the products you list, sell, and deliver through the Platform.',
      ],
    },
    {
      id: 'onboarding',
      title: '2. Onboarding and Account Setup',
      content: [
        'Suppliers must complete business profile setup, branch configuration, and accept the Supplier Participation Policy before listing products.',
        'Branch Users (staff) act on behalf of the Supplier and must comply with this Agreement and the Supplier Participation Policy.',
        'You represent that all business information submitted is accurate and current.',
      ],
    },
    {
      id: 'commission',
      title: '3. Commission and Payments',
      content: [
        'EloFix charges a platform commission of 7% on the materials subtotal for orders fulfilled through the Platform.',
        'Your earning is the materials subtotal minus the platform commission.',
        'Payments are settled upon payment confirmation through licensed payment partners. Material payments are not held in job-completion escrow.',
        'EloFix may deduct refunds, chargebacks, and adjustments from amounts payable to you.',
      ],
    },
    {
      id: 'fulfilment',
      title: '4. Order Fulfilment and Delivery',
      content: [
        'You must accept, prepare, and fulfil material orders in accordance with the Supplier Participation Policy and displayed fulfilment timelines.',
        'You are responsible for delivery obligations, tracking, and customer communication regarding order status.',
        'Delivery fees may be processed as separate payment intents.',
      ],
    },
    {
      id: 'refunds-chargebacks',
      title: '5. Refunds and Chargebacks',
      content: [
        'You are responsible for refund and chargeback costs associated with your orders, including commission reversals where applicable.',
        'Refund eligibility depends on fulfilment stage as described in the Refund and Cancellation Policy.',
      ],
    },
    {
      id: 'data',
      title: '6. Data Handling',
      content: [
        'You must handle Customer personal information received through orders in compliance with POPIA. You may only use such data for order fulfilment.',
        'See the Data Processing Policy for EloFix\'s role as operator.',
      ],
    },
    {
      id: 'indemnification',
      title: '7. Indemnification and Liability',
      content: [
        'You indemnify EloFix for claims arising from products you supply, including defective goods, incorrect items, delivery failures, and regulatory non-compliance.',
        'You are solely responsible for product quality, safety, labelling, and compliance with South African consumer protection law.',
      ],
    },
    {
      id: 'termination',
      title: '8. Suspension and Termination',
      content: [
        'EloFix may suspend or remove Supplier access for policy violations, poor fulfilment performance, fraud, or legal risk.',
        'You may deactivate your account subject to completion of outstanding orders and payment obligations.',
      ],
    },
    {
      id: 'updates',
      title: '9. Updates',
      content: [
        'We may update this Supplier Agreement from time to time. Material changes may require renewed acceptance.',
      ],
    },
  ],
};

export const supplierParticipation: LegalDocument = {
  id: 'supplier-participation',
  title: 'Supplier Participation Policy',
  subtitle: 'Operational standards for listing and fulfilling products on EloFix.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.supplierParticipation,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        'This policy describes the responsibilities of Suppliers participating in the EloFix (Pty) Ltd materials marketplace.',
      ],
    },
    {
      id: 'pricing-accuracy',
      title: '2. Pricing Accuracy',
      content: [
        'Suppliers must ensure that listed prices are accurate, current, and inclusive of applicable taxes where required by law.',
        'Price changes must be updated on the Platform before they apply to new orders.',
      ],
    },
    {
      id: 'stock-accuracy',
      title: '3. Stock and Inventory Accuracy',
      content: [
        'Suppliers must maintain accurate stock levels and inventory data for each branch.',
        'Accepting orders for out-of-stock items is prohibited. Repeated stock inaccuracies may result in listing restrictions.',
      ],
    },
    {
      id: 'product-descriptions',
      title: '4. Product Descriptions',
      content: [
        'Product descriptions, specifications, images, and categories must be accurate and not misleading.',
        'Suppliers are responsible for ensuring products comply with applicable safety standards and labelling requirements in South Africa.',
      ],
    },
    {
      id: 'delivery',
      title: '5. Delivery Obligations',
      content: [
        'Suppliers must fulfil delivery obligations according to configured delivery settings and order acceptance timelines.',
        'Delivery issues, delays, and tracking updates must be communicated through the Platform.',
        'Suppliers must cooperate with delivery rating and feedback processes.',
      ],
    },
    {
      id: 'marketing',
      title: '6. Marketing Permissions',
      content: [
        'By listing products on EloFix, Suppliers grant EloFix a non-exclusive licence to display product images, names, descriptions, and pricing in Platform search, marketing, and promotional materials.',
      ],
    },
    {
      id: 'listing-removal',
      title: '7. Listing Removal',
      content: [
        'EloFix may remove or restrict product listings that violate this policy, the Community Standards, applicable law, or that receive repeated customer complaints.',
        'EloFix may remove Supplier access entirely for serious or repeated violations.',
      ],
    },
    {
      id: 'contact',
      title: '8. Contact',
      content: [
        'Supplier participation questions: support@elofix.com.',
      ],
    },
  ],
};
