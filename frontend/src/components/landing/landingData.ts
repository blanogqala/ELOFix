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

export interface SupplierBrand {
  name: string;
  tagline: string;
  initials: string;
  color: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  rating: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export const LANDING_STATS: LandingStat[] = [
  { value: '10K+', label: 'Verified Providers' },
  { value: '50K+', label: 'Jobs Completed' },
  { value: '4.8★', label: 'Average Rating' },
  { value: '24/7', label: 'Platform Support' },
];

export const PLATFORM_FEATURES: PlatformFeature[] = [
  {
    id: 'request-services',
    icon: Wrench,
    title: 'Request Services',
    description:
      'Post maintenance jobs, compare verified providers, and manage work from quote to completion — all in one place.',
    highlights: ['AI-assisted estimates', 'Portfolio & reviews', 'Milestone tracking'],
    accent: 'primary',
  },
  {
    id: 'order-materials',
    icon: ShoppingCart,
    title: 'Order Materials',
    description:
      'Browse approved hardware catalogs and order building supplies directly — with or without hiring a service provider.',
    highlights: ['Live branch pricing', 'Specials & bundles', 'Instant checkout'],
    accent: 'accent',
  },
  {
    id: 'trusted-providers',
    icon: BadgeCheck,
    title: 'Trusted Providers',
    description:
      'Every provider is vetted with ID verification, skill checks, and portfolio review before joining the marketplace.',
    highlights: ['Background checks', 'Verified badges', 'Customer ratings'],
    accent: 'success',
  },
  {
    id: 'approved-suppliers',
    icon: Store,
    title: 'Approved Hardware Suppliers',
    description:
      'Shop from nationally trusted hardware retailers integrated into EloFix with real inventory and branch-level fulfillment.',
    highlights: ['Official catalogs', 'Quality assurance', 'Competitive pricing'],
    accent: 'primary',
  },
  {
    id: 'delivery-collection',
    icon: Truck,
    title: 'Delivery or Collection',
    description:
      'Choose doorstep delivery with live tracking or collect from your nearest supplier branch — you decide what works best.',
    highlights: ['Real-time tracking', 'Branch pickup', 'Flexible scheduling'],
    accent: 'accent',
  },
  {
    id: 'supplier-branches',
    icon: GitBranch,
    title: 'Supplier Branch System',
    description:
      'Multi-branch suppliers manage inventory, staff, and orders per location — customers always get the nearest available stock.',
    highlights: ['Branch-level stock', 'Staff dashboards', 'Local fulfillment'],
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
      'Compare verified providers or select your preferred supplier branch. Review quotes, catalogs, and delivery options upfront.',
  },
  {
    step: 3,
    icon: Lock,
    title: 'Pay Securely',
    description:
      'Funds are protected with escrow until work is approved or materials are delivered. Track every step in real time.',
  },
];

export const TRUST_ITEMS: TrustItem[] = [
  {
    icon: Shield,
    title: 'Verified Providers',
    description: 'Rigorous onboarding with ID, skills, and portfolio verification.',
  },
  {
    icon: Building2,
    title: 'Approved Suppliers',
    description: 'Only vetted national hardware partners with integrated catalogs.',
  },
  {
    icon: CreditCard,
    title: 'Secure Payments',
    description: 'Encrypted checkout with multiple payment methods supported.',
  },
  {
    icon: Lock,
    title: 'Escrow Protection',
    description: 'Your money is held safely until you approve the outcome.',
  },
  {
    icon: Radar,
    title: 'Real-Time Tracking',
    description: 'Follow deliveries, job progress, and order status live on the map.',
  },
  {
    icon: Package,
    title: 'Transparent Pricing',
    description: 'Clear material and labor breakdowns — no hidden surprises.',
  },
];

export const SUPPLIER_BRANDS: SupplierBrand[] = [
  { name: 'Builders Warehouse', tagline: 'Build & renovate', initials: 'BW', color: 'from-orange-500 to-orange-600' },
  { name: 'BUCO', tagline: 'Hardware & tools', initials: 'BU', color: 'from-red-600 to-red-700' },
  { name: 'Cashbuild', tagline: 'Building materials', initials: 'CB', color: 'from-yellow-500 to-amber-600' },
  { name: 'Brights Hardware', tagline: 'Trade supplies', initials: 'BH', color: 'from-blue-600 to-blue-700' },
  { name: 'Mica', tagline: 'Home improvement', initials: 'MI', color: 'from-emerald-600 to-emerald-700' },
  { name: 'Chamberlain', tagline: 'Paint & hardware', initials: 'CH', color: 'from-violet-600 to-violet-700' },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'I booked a plumber and ordered tiles from Cashbuild in one session. Delivery tracking was spot-on and the escrow gave me peace of mind.',
    name: 'Thandi M.',
    role: 'Homeowner · Johannesburg',
    rating: 5,
  },
  {
    quote:
      'As a property manager, EloFix cut our maintenance coordination time in half. Verified providers and branch-level material orders are a game changer.',
    name: 'David K.',
    role: 'Property Manager · Cape Town',
    rating: 5,
  },
  {
    quote:
      'Our branch staff love the dashboard. Orders route to the nearest store automatically and customers can collect or get delivery — seamless.',
    name: 'Nomsa R.',
    role: 'Supplier Branch Manager · Durban',
    rating: 5,
  },
  {
    quote:
      'Joining as a provider brought quality leads every week. Secure payments and clear job workflows mean I focus on the work, not chasing invoices.',
    name: 'Sipho N.',
    role: 'Electrical Provider · Pretoria',
    rating: 5,
  },
];

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is EloFix?',
    answer:
      'EloFix is a maintenance marketplace and hardware procurement platform. Customers can request verified service providers, order building materials directly, or combine both in a single workflow.',
  },
  {
    question: 'Can I order materials without booking a service?',
    answer:
      'Yes. Use Order Materials to browse approved supplier catalogs, pick your nearest branch, and checkout for delivery or collection — no provider required.',
  },
  {
    question: 'How are providers verified?',
    answer:
      'Providers complete ID verification, skill assessment, and portfolio review. Verified badges appear on profiles so you can choose with confidence.',
  },
  {
    question: 'How does escrow protection work?',
    answer:
      'When you pay through EloFix, funds are held securely until you confirm the job is complete or materials are received as expected. Disputes are handled through our support team.',
  },
  {
    question: 'What is the supplier branch system?',
    answer:
      'National suppliers operate multiple branches on EloFix. Each branch manages its own inventory and fulfillment, so customers get accurate stock and faster pickup or delivery.',
  },
  {
    question: 'How do I become a provider or supplier partner?',
    answer:
      'Providers can register directly on EloFix. Supplier partnerships are onboarded through our team — use the Supplier Partnership section to get in touch and join the ecosystem.',
  },
];

export const PARTNERSHIP_BENEFITS = [
  'Reach customers ordering materials nationwide',
  'Branch-level inventory & staff management',
  'Integrated order and delivery workflows',
  'Analytics, earnings, and performance dashboards',
];
