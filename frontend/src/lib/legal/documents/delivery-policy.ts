import type { LegalDocument } from '../content';
import { LEGAL_VERSIONS } from '../versions';
import { COMPANY, LEGAL_OPERATOR_INTRO } from '../../company';

const EFFECTIVE = 'August 18, 2026';

export const deliveryPolicy: LegalDocument = {
  id: 'delivery-policy',
  title: 'Delivery & Collection Policy',
  subtitle: 'How collection, store delivery, and courier delivery work for EloFix material orders and courier jobs.',
  effectiveDate: EFFECTIVE,
  version: LEGAL_VERSIONS.deliveryPolicy,
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        LEGAL_OPERATOR_INTRO,
        'This Delivery & Collection Policy describes how materials and courier jobs are collected or delivered when arranged through the EloFix Platform.',
        `${COMPANY.brandName} is a marketplace. Independent suppliers fulfil material orders. Independent delivery providers (couriers) may transport goods or complete standalone delivery and moving jobs. ${COMPANY.legalName} does not itself operate a courier fleet or warehouse.`,
        'Payment processing for materials and delivery fees is handled through applicable third-party payment service provider(s). Delivery fees, where charged, are typically processed as a separate payment from the materials payment.',
      ],
    },
    {
      id: 'scope',
      title: '2. Scope',
      content: [
        'This policy covers: (a) customer pickup / branch collection of material orders; (b) supplier or store delivery of material orders; (c) hired delivery-provider / courier delivery of material orders; and (d) standalone delivery or moving jobs requested through the Platform.',
        'Service Jobs that do not involve material fulfilment or courier transport are governed by the Terms of Service, Provider Agreement, and related policies.',
        'This policy should be read with the Refund, Returns & Cancellation Policy, Supplier Agreement, Supplier Participation Policy, and Provider Agreement.',
      ],
    },
    {
      id: 'collection',
      title: '3. Customer Pickup / Branch Collection',
      content: [
        'Where the Platform offers collection, a Customer may choose to collect a material order from the fulfilling supplier branch.',
        'Collection from the branch does not attract a Platform delivery fee. The Customer is responsible for collecting the goods at the branch during the times and conditions communicated on the order.',
        'The supplier prepares the order and marks it ready for collection. The Customer should confirm collection through the Platform when the goods have been collected.',
        'Risk in the goods transfers according to the supplier\'s fulfilment and applicable law. Customers should inspect goods at collection and report issues promptly through the Platform.',
      ],
    },
    {
      id: 'store-delivery',
      title: '4. Supplier / Store Delivery',
      content: [
        'Some supplier branches offer store delivery. This option is available only where the branch has enabled delivery on the Platform.',
        'The branch quotes a delivery fee after the Customer requests store delivery. The quoted fee is not automatically calculated at checkout and is not a guaranteed tariff.',
        'After the Customer accepts the quoted delivery fee, the delivery fee is paid as a separate payment through the applicable payment service provider.',
        'The supplier is responsible for fulfilling store delivery, including packing, transport, and customer communication for that mode, subject to this policy and the Supplier Agreement.',
        'Where the Platform enables live location sharing for store delivery, that tracking is supplier-led while the order is out for delivery.',
      ],
    },
    {
      id: 'courier-delivery',
      title: '5. Delivery Provider / Courier Delivery',
      content: [
        'A Customer may request a delivery provider (courier) to collect materials from a supplier and deliver them to a destination address, where that option is offered on the order.',
        'The selected delivery provider quotes a delivery fee. Displayed profile rates or estimated times, if shown, are indicative only and are not the charged amount unless the Customer accepts a quote.',
        'After the Customer accepts the quote, the delivery fee is paid as a separate payment through the applicable payment service provider.',
        'The delivery provider is an independent service provider, not an employee of EloFix or of LITI Holdings (Pty) Ltd. The courier is responsible for collection, transport, and delivery of the assigned order, subject to the Provider Agreement and this policy.',
        'Where the Platform enables live location sharing for courier delivery, that tracking is provider-led while the courier is collecting or out for delivery.',
      ],
    },
    {
      id: 'standalone-jobs',
      title: '6. Standalone Delivery and Moving Jobs',
      content: [
        'Customers may request standalone delivery or moving jobs through the Platform, separate from a material order.',
        'These jobs require a collection address and a destination address. The addresses must be distinct.',
        'An independent delivery or moving provider submits a quote. The Customer pays after accepting the quote, according to the payment model shown for that service category.',
        'Standalone courier and moving jobs follow the applicable Job, completion, cancellation, and dispute policies in addition to this policy.',
      ],
    },
    {
      id: 'fees',
      title: '7. Delivery Fee Calculation',
      content: [
        'Branch collection: no Platform delivery fee.',
        'Store delivery: the fulfilling branch quotes the fee. The Customer pays the quoted fee after acceptance.',
        'Courier delivery (materials): the assigned delivery provider quotes the fee. The Customer pays the quoted fee after acceptance.',
        'Standalone delivery or moving jobs: the provider quotes for the job as shown on the Platform.',
        'EloFix does not promise a fixed per-kilometre tariff, a maximum fee, or that a previously quoted fee will remain available if the quote expires or the order changes.',
      ],
    },
    {
      id: 'addresses',
      title: '8. Delivery Addresses',
      content: [
        'Customers must provide accurate collection and/or destination details as required by the selected fulfilment mode, including address, city, and any access instructions requested on the Platform.',
        'For branch collection, the collection point is the supplier branch address shown on the order.',
        'For store or courier delivery, the destination is the Customer delivery address captured for the order.',
        'Incorrect, incomplete, or inaccessible addresses may result in delay, failed delivery, additional quotes, or cancellation according to Platform status rules.',
      ],
    },
    {
      id: 'timing',
      title: '9. Estimated Delivery Timing',
      content: [
        'EloFix does not guarantee delivery dates or times. Any estimated time shown on a provider profile, map, or tracking view is operational information only and is not a contractual service-level agreement.',
        'Live map duration, where displayed, is an approximate driving estimate and may change with traffic, access, weather, load shedding, or the parties\' availability.',
        'Suppliers and delivery providers should communicate material delays through the Platform.',
      ],
    },
    {
      id: 'tracking',
      title: '10. Order Tracking',
      content: [
        'Where a tracking session is created for an order, the Customer may follow status updates on the Platform and, where issued, on the public tracking page associated with that order.',
        'Live GPS tracking, where available, typically applies while store delivery is out for delivery (supplier-led) or while a courier is collecting or out for delivery (provider-led).',
        'Tracking may be unavailable for collection orders, before dispatch, after completion, or if a tracking session expires or is not started.',
      ],
    },
    {
      id: 'confirmation',
      title: '11. Delivery and Collection Confirmation',
      content: [
        'Collection: the Customer should confirm collection through the Platform when the supplier has marked the order ready and the goods have been collected.',
        'Store or courier delivery: the supplier or courier marks delivery complete according to Platform fulfilment steps. The Customer may acknowledge receipt through the Platform.',
        'If the Customer has opened a delivery-issue report, confirmation of receipt may be blocked until the issue is handled according to Platform processes.',
        'Customers may be invited to rate the fulfilment after completion.',
      ],
    },
    {
      id: 'failed-delayed',
      title: '12. Failed Delivery and Delays',
      content: [
        'A supplier or courier may mark a delivery as delayed or failed where the Platform supports those fulfilment statuses, for example where the recipient is unavailable, the address cannot be accessed, or an operational issue prevents completion.',
        'Delayed deliveries may continue through later fulfilment steps if the parties resume the delivery.',
        'Failed deliveries should be communicated through the Platform. A replacement attempt, re-quote, collection instead of delivery, or cancellation may follow depending on order status, the parties\' agreement, and applicable refund rules.',
        'EloFix does not guarantee a successful delivery attempt or a specific number of re-attempts.',
      ],
    },
    {
      id: 'damaged-incorrect',
      title: '13. Damaged or Incorrect Goods',
      content: [
        'Customers should inspect goods on collection or delivery.',
        'For material orders, the Platform allows a Customer to report delivery issues after fulfilment is marked complete and before the Customer confirms receipt. Reportable issues include missing items, broken or damaged items, wrong items, goods not received, or other problems described on the form.',
        'Reporting an issue notifies the relevant supplier branch so the matter can be investigated. Refunds, replacements, or returns follow the Refund, Returns & Cancellation Policy and the supplier\'s fulfilment of the order.',
        'EloFix facilitates the report and related Platform records. The supplier remains responsible for the goods they supply. A delivery provider remains responsible for the transport they undertake.',
      ],
    },
    {
      id: 'cancellation',
      title: '14. Cancellation',
      content: [
        'Material-order cancellation by the Customer is generally available while the order is still pending, accepted, being prepared, or ready for collection, and is not available after the order has been dispatched / is out for delivery.',
        'A supplier may cancel an order in accordance with Platform rules except where the order is already cancelled, completed, or failed, subject to refund treatment in the Refund, Returns & Cancellation Policy.',
        'Standalone courier or moving jobs generally cannot be cancelled by the Customer after items have been collected, or while the job is awaiting completion confirmation, as implemented on the Platform.',
        'While a courier Provider is collecting items and labor has been paid, Customer cancellation may result in no labor refund where the Refund, Returns & Cancellation Policy provides for that courier en-route forfeiture. Ordinary service Jobs do not use that automatic R0 rule; they may open an administrator review instead.',
        'Specific eligibility is determined by Platform status at the time of cancellation and the Refund, Returns & Cancellation Policy. This policy does not create additional refund rights.',
      ],
    },
    {
      id: 'customer-responsibilities',
      title: '15. Customer Responsibilities',
      content: [
        'Provide complete and accurate addresses and contact details.',
        'Be available to collect goods or receive delivery, or arrange an authorised recipient.',
        'Pay quoted delivery fees when you accept them, through the Platform payment flow.',
        'Inspect goods and report issues promptly through the Platform.',
        'Do not request delivery to an unlawful or inaccessible location.',
      ],
    },
    {
      id: 'supplier-responsibilities',
      title: '16. Supplier Responsibilities',
      content: [
        'Prepare, pack, and make goods available according to the selected fulfilment mode and the Supplier Participation Policy.',
        'Quote store-delivery fees accurately where store delivery is offered, and fulfil store delivery with reasonable care.',
        'Keep stock, product descriptions, and order status accurate.',
        'Communicate delays, failed delivery, and tracking updates through the Platform.',
        'Cooperate with delivery-issue reports, ratings, and any investigation.',
      ],
    },
    {
      id: 'provider-responsibilities',
      title: '17. Delivery-Provider Responsibilities',
      content: [
        'Quote fairly for the collection and destination shown on the assignment.',
        'Collect, transport, and deliver with reasonable care, and update Platform fulfilment status honestly.',
        'Share live location while collecting or out for delivery where the Platform requires tracking for that assignment.',
        'Report failed or delayed delivery through the Platform.',
        'Comply with the Provider Agreement, Community Standards, and applicable road-traffic and goods-handling law.',
      ],
    },
    {
      id: 'contact',
      title: '18. Contact',
      content: [
        `Questions about this Delivery & Collection Policy may be sent to ${COMPANY.email} with your order or Job reference number.`,
        `${COMPANY.operatorStatement} Country of domicile: ${COMPANY.country}.`,
      ],
    },
  ],
};
