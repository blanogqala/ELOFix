import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CreditCard,
  MapPin,
  Package,
  Shield,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wrench,
  GitBranch,
  BadgeCheck,
  Lock,
  Radar,
} from 'lucide-react';

export interface LandingStat {
  value: string;
  label: string;
}

export interface PlatformFeature {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  highlights: string[];
  accent: 'primary' | 'accent' | 'success';
}

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface TrustItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface SupplierCapability {
  name: string;
  tagline: string;
  initials: string;
  color: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  rating: number;
}

export const LANDING_STATS: LandingStat[] = [
  { value: 'ZAR', label: 'Quoted in Rand' },
  { value: 'Quote', label: 'Service pricing' },
  { value: 'Pickup', label: 'Or delivery' },
  { value: 'Track', label: 'Live order status' },
];

export const PLATFORM_FEATURES: PlatformFeature[] = [
  {
    id: 'request-services',
    icon: Wrench,
    title: 'Request Services',
    description:
      'Post maintenance jobs, compare independent providers, and manage work from quote to completion — all in one place.',
    highlights: ['Provider quotes', 'Portfolio & reviews', 'Clear job tracking'],
    accent: 'primary',
  },
  {
    id: 'order-materials',
    icon: ShoppingCart,
    title: 'Order Materials',
    description:
      'Order building, hardware, and project materials from participating suppliers — with or without hiring a service provider.',
    highlights: ['Branch catalogues', 'Collection or delivery', 'Prices in ZAR'],
    accent: 'accent',
  },
  {
    id: 'trusted-providers',
    icon: BadgeCheck,
    title: 'Independent Providers',
    description:
      'Providers complete identity and document verification on EloFix before they can accept paid jobs, subject to review.',
    highlights: ['Document verification', 'Skill categories', 'Customer ratings'],
    accent: 'success',
  },
  {
    id: 'approved-suppliers',
    icon: Store,
    title: 'Participating Suppliers',
    description:
      'EloFix supports purchases of building and hardware materials from suppliers who join the marketplace and list their branches.',
    highlights: ['Branch inventory', 'Staff dashboards', 'Order fulfilment'],
    accent: 'primary',
  },
  {
    id: 'delivery-collection',
    icon: Truck,
    title: 'Delivery or Collection',
    description:
      'Collect from a supplier branch, request store delivery, or hire a delivery provider — according to the options offered on the order.',
    highlights: ['Branch pickup', 'Store delivery', 'Courier delivery'],
    accent: 'accent',
  },
  {
    id: 'supplier-branches',
    icon: GitBranch,
    title: 'Supplier Branch System',
    description:
      'Multi-branch suppliers can manage inventory, staff, and orders per location on EloFix.',
    highlights: ['Branch-level stock', 'Staff dashboards', 'Local fulfilment'],
    accent: 'success',
  },
];

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    step: 1,
    icon: MapPin,
    title: 'Describe Your Need',
    description:
      'Request a service or order materials. Add photos, measurements, and location so providers and suppliers can respond accurately.',
  },
  {
    step: 2,
    icon: Users,
    title: 'Choose & Confirm',
    description:
      'Compare providers or select a supplier branch. Review quotes, catalogues, and delivery options before you pay.',
  },
  {
    step: 3,
    icon: Lock,
    title: 'Pay Securely',
    description:
      'Flexible payment options for every service, displayed in South African Rand (ZAR). Selected jobs use a 50% mobilisation payment before work begins and the remaining 50% after completion; others use a single payment. Track every step in real time.',
  },
];

export const TRUST_ITEMS: TrustItem[] = [
  {
    icon: Shield,
    title: 'Provider verification',
    description: 'Providers submit identity and business documents for review before accepting paid jobs.',
  },
  {
    icon: Building2,
    title: 'Participating suppliers',
    description: 'Suppliers who join EloFix can list branches, inventory, and fulfilment options.',
  },
  {
    icon: CreditCard,
    title: 'Secure Payments',
    description: 'Checkout is processed through applicable third-party payment service provider(s).',
  },
  {
    icon: Lock,
    title: 'Flexible Payments',
    description: 'Staged or single payment depending on the service category — schedules shown before you pay.',
  },
  {
    icon: Radar,
    title: 'Order Tracking',
    description: 'Follow job progress and, where enabled, live delivery location on the map.',
  },
  {
    icon: Package,
    title: 'Transparent Pricing',
    description: 'Service work is quotation-based in ZAR. Material prices are those listed by the supplier.',
  },
];

export const SUPPLIER_CAPABILITIES: SupplierCapability[] = [
  { name: 'Branch collection', tagline: 'Collect from the store', initials: 'PK', color: 'from-orange-500 to-orange-600' },
  { name: 'Store delivery', tagline: 'Quoted by the branch', initials: 'SD', color: 'from-blue-600 to-blue-700' },
  { name: 'Courier delivery', tagline: 'Quoted by a provider', initials: 'CD', color: 'from-emerald-600 to-emerald-700' },
  { name: 'Branch inventory', tagline: 'Stock per location', initials: 'BI', color: 'from-violet-600 to-violet-700' },
  { name: 'Materials in ZAR', tagline: 'Supplier-listed prices', initials: 'R', color: 'from-amber-500 to-amber-600' },
  { name: 'Order tracking', tagline: 'Where fulfilment is live', initials: 'TR', color: 'from-red-600 to-red-700' },
];

export const TESTIMONIALS: Testimonial[] = [];

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is EloFix?',
    answer:
      'EloFix is a marketplace platform operated by LITI Holdings (Pty) Ltd. Customers use EloFix to connect with independent service providers and to purchase building, hardware, and project materials from participating suppliers.',
  },
  {
    question: 'What services can I request?',
    answer:
      'EloFix is designed for home and property maintenance work. Typical service types include plumbing, electrical, cleaning, construction, tiling, painting, moving, and property maintenance. Available categories on the site are those listed for customers to request. Service pricing is quotation-based and displayed in South African Rand (ZAR). EloFix does not publish a fixed price list for labour.',
  },
  {
    question: 'Can I order materials without booking a service?',
    answer:
      'Yes. Use Order Materials to browse catalogues from participating supplier branches and check out for delivery or collection — no service provider is required. Prices are shown in ZAR by the supplier after you sign in.',
  },
  {
    question: 'How are providers verified?',
    answer:
      'Providers complete identity and document verification, including skill categories and portfolio information, subject to EloFix review before they can accept paid jobs.',
  },
  {
    question: 'How do payments work on EloFix?',
    answer:
      'Flexible payment options for every service, shown in ZAR. Selected services can be paid in two stages — a 50% mobilisation payment before work begins and the remaining 50% after completion. Some services use a single payment, depending on the service category. Settlement is processed through applicable third-party payment service provider(s); EloFix does not hold or guarantee provider funds.',
  },
  {
    question: 'How does collection and delivery work?',
    answer:
      'For material orders you may collect from the branch, request store delivery where the branch offers it, or hire a delivery provider. Store and courier delivery fees are quoted, then paid separately. EloFix does not guarantee delivery times. See the Delivery & Collection Policy for details.',
  },
  {
    question: 'How do I become a provider or supplier?',
    answer:
      'Providers can register directly on EloFix. Suppliers can enquire through the Supplier Partnership section. Joining does not imply an exclusive or pre-existing retail partnership.',
  },
];

export const PARTNERSHIP_BENEFITS = [
  'List branches and inventory for customers ordering materials',
  'Branch-level inventory and staff management',
  'Integrated order, collection, and delivery workflows',
  'Order and performance dashboards',
];
