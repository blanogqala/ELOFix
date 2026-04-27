// FixMate Domain Types

export type UserRole = 'user' | 'provider' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'user';
  profileImage?: string;
  createdAt: string;
}

export interface WorkPost {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  images: string[];
  createdAt: string;
}

export interface ProviderSettings {
  notifications: {
    jobRequests: boolean;
    payments: boolean;
    marketing: boolean;
  };
  availability: boolean;
  businessHours: {
    [day: string]: { open: string; close: string; enabled: boolean };
  };
}

export interface Provider {
  id: string;
  profileId?: string;
  name: string;
  email: string;
  phone: string;
  role: 'provider';
  businessName?: string;
  city?: string;
  serviceAreas?: string[];
  skills: string[];
  laborPricing: Record<string, { unit: 'sqm' | 'hour' | 'job' | 'meter'; rate: number }>;
  documents: {
    idDoc?: {
      url: string;
      fileId?: string;
      originalName?: string;
      type?: string;
      status?: 'pending' | 'approved' | 'rejected';
      feedback?: string;
    };
    companyReg?: {
      url: string;
      fileId?: string;
      originalName?: string;
      type?: string;
      status?: 'pending' | 'approved' | 'rejected';
      feedback?: string;
    };
    proofOfSkill?: {
      url: string;
      fileId?: string;
      originalName?: string;
      type?: string;
      status?: 'pending' | 'approved' | 'rejected';
      feedback?: string;
    };
  };
  portfolioImages: string[];
  /** Public profile photo URL or data URL */
  profileImage?: string;
  workPosts?: WorkPost[];
  settings?: ProviderSettings;
  approved: boolean;
  /** Backend-computed; all required sections complete */
  profileCompleted?: boolean;
  rating: number;
  completedJobs: number;
  responseTime: string;
  bio?: string;
  yearsExperience?: number;
  certifications?: string[];
  reviews?: ProviderReview[];
  createdAt: string;
  blocked?: boolean;
  rejectionReason?: string;
  rejectedAt?: string;
  deletedAt?: string;
  /** When provider clicked Submit for review (profile complete) */
  reviewSubmittedAt?: string;
  /** PATCH only: set true to record review submission */
  submitForReview?: boolean;
  pendingSuggestionsCount?: number;
  pendingSuggestions?: Array<{
    id: string;
    name: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
  }>;
}

export interface ProviderReview {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  jobId: string;
  createdAt: string;
  jobTitle?: string;
  jobCategory?: string;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: 'admin';
}

export type AuthUser = User | Provider | Admin;

export interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
  requiresMaterials: boolean;
  skills: string[];
  step3Type: 'measurements' | 'items' | 'issue';
  issueTypes?: string[];
  commonItems?: { id: string; name: string; icon: string; defaultWeight?: number }[];
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  /** When false, provider goes straight to pricing after accepting the job */
  requiresInspection?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  qualityTier: 'low' | 'medium' | 'high';
  unit: string;
  inStock: boolean;
  special?: boolean;
  specialEndDate?: string;
  image?: string;
}

export interface Supplier {
  id: string;
  name: string;
  logo?: string;
  hasDelivery: boolean;
  deliveryFee?: number;
  products: Product[];
}

export interface MaterialLine {
  supplierId: string;
  supplierName: string;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  qualityTier: 'low' | 'medium' | 'high';
  unit: string;
  isExtra?: boolean;
  imageUrl?: string;
}

export interface MovingItem {
  id: string;
  name: string;
  qty: number;
  weight?: number;
  description?: string;
}

export interface PlumbingIssue {
  type: string;
  /** Omitted when using camera measurement; use main task description instead. */
  description?: string;
  photo?: string;
}

/** Structured camera / guided measurement (stored inside `measurements` JSON). */
export type CameraAssistDimensionMode = 'lengthWidth' | 'heightWidth';

export interface CameraAssistMeasurement {
  type: 'area' | 'linear' | 'custom';
  unit: 'm' | 'cm';
  dimensionMode: CameraAssistDimensionMode;
  length?: number;
  width?: number;
  height?: number;
  /** Always square meters when set (normalized on save). */
  area?: number;
  imageUrl?: string;
  source: 'manual' | 'camera';
  /** Populated by API: dimensions in meters / area in m². */
  normalized?: {
    lengthM?: number;
    widthM?: number;
    heightM?: number;
    areaM2?: number;
  };
}

export interface Measurements {
  source: 'AI' | 'MANUAL';
  values: Record<string, number>;
  movingItems?: MovingItem[];
  plumbingIssue?: PlumbingIssue;
  /** Guided / camera pipeline; backward compatible when absent. */
  cameraAssist?: CameraAssistMeasurement;
}

export type PaymentPlanType = 'UPFRONT' | 'DEPOSIT' | 'MILESTONE';

export interface PaymentPlan {
  type: PaymentPlanType;
  depositPercent?: number;
  milestoneFrequency?: 'monthly' | 'quarterly';
}

export interface Escrow {
  enabled: boolean;
  holdPercent: number;
  heldAmount: number;
  releasedAmount: number;
}

export type JobStatus = 'PENDING' | 'ASSIGNED' | 'INSPECTED' | 'SERVICE_PRICE_SUBMITTED' | 'SERVICE_PAID' | 'MATERIALS_SUBMITTED' | 'MATERIALS_PAID' | 'IN_PROGRESS' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';

export interface JobNote {
  id: string;
  authorId: string;
  authorRole: UserRole;
  authorName: string;
  message: string;
  title?: string;
  attachment?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorRole: UserRole;
  authorName: string;
  message: string;
  createdAt: string;
}

export interface ProviderSuggestion {
  id: string;
  productId: string;
  originalProductId?: string;
  message: string;
  suggested: MaterialLine;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface UserMaterialSuggestion {
  id: string;
  productId: string;
  originalProductId?: string;
  message: string;
  suggested: MaterialLine;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface MaterialPayment {
  orderId?: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  status: 'pending' | 'paid';
  paidAt?: string;
  deliveryProviderId?: string;
  deliveryProviderName?: string;
  deliveryFee?: number;
}

// Shared delivery & payment models for material orders
export type DeliveryStatus =
  | 'SelfCollect'
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'InProgress'
  | 'Delivered';

export interface OrderDelivery {
  type: 'SELF' | 'STORE' | 'PROVIDER';
  status: DeliveryStatus;
  providerId?: string;
  fee: number;
}

export interface OrderPayment {
  materialsPaid: boolean;
  deliveryPaid: boolean;
}

// Job-attached store material orders & delivery tracking
export type StoreOrderDeliveryType = 'SELF' | 'STORE' | 'PROVIDER';

export type StoreOrderDeliveryStatus =
  | 'SelfCollect'
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'InProgress'
  | 'Processing'
  | 'OnTheWay'
  | 'Delivered';

export interface StoreOrderDeliveryRequest {
  providerId: string;
  status: 'PendingApproval' | 'Approved';
  requestedAt: string;
  approvedAt?: string;
}

export interface JobStoreOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  qualityTier: 'low' | 'medium' | 'high';
  imageUrl?: string;
}

export interface JobLocation {
  address?: string;
  city?: string;
  area?: string;
  suburb?: string;
  notes?: string;
  coordinates?: { lat: number; lng: number };
}

export interface JobStoreOrder {
  storeId: string;
  orderId: string;
  /** When created from acceptUserSuggestion — ties this cycle to exactly one suggestion (avoids wrong order when same product appears in multiple cycles). */
  sourceUserSuggestionId?: string;
  submissionBatchId?: string;
  items: JobStoreOrderItem[];
  storeName?: string;
  storeLogo?: string;
  deliveryType: StoreOrderDeliveryType;
  deliveryProviderId?: string;
  deliveryFee: number;
  deliveryStatus: StoreOrderDeliveryStatus;
  paymentStatus: 'Paid';
   // Nested delivery/payment for richer workflows
  delivery?: OrderDelivery;
  payment?: OrderPayment;
  invoiceId: string;
  deliveryInvoiceId?: string;
  createdAt: string;
  deliveryRequest?: StoreOrderDeliveryRequest;
}

export interface Job {
  id: string;
  category: string;
  categoryName: string;
  userId: string;
  userName: string;
  providerId?: string;
  providerName?: string;
  description: string;
  images: string[];
  measurements: Measurements;
  materials: MaterialLine[];
  laborEstimateRange: { min: number; max: number; unit: string };
  totalEstimateRange: { min: number; max: number };
  paymentPlan: PaymentPlan;
  escrow: Escrow;
  status: JobStatus;
  jobNotes: JobNote[];
  chat: ChatMessage[];
  proposedLaborPrice?: { amount: number; reason: string };
  providerSuggestions?: ProviderSuggestion[];
  materialPayments?: MaterialPayment[];
  laborPaid: boolean;
  /** True when escrow for this job has been fully released to the provider */
  paymentReleased?: boolean;
  userRating?: number;
  userReview?: string;
  cancellationReason?: string;
  cancellationDetails?: string;
  cancelledAt?: string;
  cancelledAtStatus?: JobStatus;
  refundAmount?: number;
  rejectionReason?: string;
  rejectionDetails?: string;
  rejectedAt?: string;
  /** When a provider declines a pending request before assignment */
  rejectedByProviderUserId?: string | null;
  completionConfirmedByUser?: boolean;
  // Per-store material orders and delivery tracking (job-attached)
  storeOrders?: JobStoreOrder[];
  servicePrice?: { amount: number; note?: string; submittedAt?: string };
  servicePayment?: {
    status: 'paid';
    amount: number;
    paidAt: string;
    paymentRef: string;
    paidBy: string;
    maskedPaymentMethod: string;
  };
  providerAdjustedRequirements?: {
    measurements?: Partial<Measurements>;
    requirementNotes?: string;
  };
  userMaterialSuggestions?: UserMaterialSuggestion[];
  location?: JobLocation;
  createdAt: string;
  updatedAt: string;
  /** From category; when false, inspection step is skipped for this job */
  requiresInspection?: boolean;
  /** Customer gross (labor) after settlement; source of truth from API */
  totalPrice?: number;
  commissionAmount?: number;
  providerAmount?: number;
  /** Cumulative amount released to provider (not platform fee) */
  releasedAmount?: number;
  /** Provider share not yet released */
  remainingAmount?: number;
}

export interface ServiceRequest {
  category: string;
  description: string;
  images: string[];
  measurements: Measurements;
  materials?: MaterialLine[];
  location?: JobLocation;
  selectedProviderId?: string;
  paymentPlan?: PaymentPlan;
}

// Payment & Invoice Types
export interface SavedCard {
  id: string;
  last4: string;
  brand: 'visa' | 'mastercard' | 'amex';
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  supplierId?: string;
  supplierName?: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  userId: string;
  type: 'labor' | 'materials' | 'refund' | 'delivery';
  status: 'paid' | 'partially_refunded' | 'refunded';
  laborCost?: number;
  materialCost?: number;
  totalAmount: number;
  refundedAmount?: number;
  lineItems: InvoiceLineItem[];
  hardwareStores?: string[];
  paymentMethod: string;
  cardLast4?: string;
  paidAt: string;
  createdAt: string;
  /** For delivery invoices: driver name */
  driverName?: string;
  /** For delivery invoices: vehicle type and number plate */
  vehicleInfo?: string;
}

// Notification Types
export type AppNotificationType =
  | 'provider_accepted'
  | 'provider_rejected'
  | 'material_paid'
  | 'job_completed'
  | 'refund_issued'
  | 'provider_suggestion'
  | 'job_cancelled'
  | 'material_list_submitted'
  | 'material_suggestion_received'
  | 'material_suggestion_accepted'
  | 'material_suggestion_rejected'
  | 'material_list_replaced'
  | 'job_request'
  | 'job_accepted'
  | 'inspection_completed'
  | 'price_submitted'
  | 'payment_made'
  | 'delivery_update'
  | 'provider_approved'
  | 'category_suggestion'
  | 'support_contact'
  | 'job_chat'
  | 'support_reply';

export interface AppNotification {
  id: string;
  userId: string;
  type: AppNotificationType;
  title: string;
  message: string;
  read: boolean;
  jobId?: string;
  conversationId?: string;
  createdAt: string;
  senderId?: string;
  senderName?: string;
  senderRole?: string;
}

// Specials Types
export interface Special {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierLogo?: string;
  productId: string;
  productName: string;
  productImage?: string;
  originalPrice: number;
  specialPrice: number;
  discountPercent: number;
  category: string;
  endDate: string;
}

// Delivery Provider
export interface DeliveryProvider {
  id: string;
  name: string;
  logo?: string;
  baseRate: number;
  perKmRate: number;
  estimatedTime: string;
  vehicleType?: string;
  numberPlate?: string;
  rating?: number;
}

// Material Order (standalone, not attached to a job)
export interface MaterialOrder {
  id: string;
  userId: string;
  storeId: string;
  storeName: string;
  items: {
    productId: string;
    name: string;
    qty: number;
    unitPrice: number;
    qualityTier: 'low' | 'medium' | 'high';
  }[];
  deliveryType: 'SELF' | 'STORE_DELIVERY' | 'DELIVERY_PROVIDER';
  deliveryProviderId?: string;
  deliveryFee: number;
  total: number;
  paymentStatus: 'paid' | 'pending';
  deliveryStatus: 'processing' | 'out_for_delivery' | 'delivered';
  // New nested delivery/payment state; legacy fields above mirror these
  delivery?: OrderDelivery;
  payment?: OrderPayment;
  invoiceId: string;
  deliveryInvoiceId?: string;
  createdAt: string;
}
