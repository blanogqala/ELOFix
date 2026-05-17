// FixMate Domain Types

export type UserRole = 'user' | 'provider' | 'admin' | 'supplier' | 'branch_staff';

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
  /** ZAR per kilometre for driving / delivery quotes (distance × rate later). */
  deliveryRatePerKm?: number;
}

/** Per-category labour — whole-job range in ZAR preferred; legacy unit rate still supported. */
export interface ProviderLaborPricingEntry {
  unit?: 'sqm' | 'hour' | 'job' | 'meter';
  /** @deprecated Prefer jobFeeLow / jobFeeHigh for customer-facing whole-job guidance. */
  rate?: number;
  /** Lowest labour for a completed job in this category (ZAR), provider-declared or synced from paid jobs. */
  jobFeeLow?: number;
  /** Highest labour for a completed job in this category (ZAR). */
  jobFeeHigh?: number;
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
  laborPricing: Record<string, ProviderLaborPricingEntry>;
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
  /** Job reviews + material delivery ratings combined (matches provider API). */
  totalReviews?: number;
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
  /** Min/max labour paid (ZAR) on completed jobs per category id; populated by listing/detail APIs. */
  completedLaborByCategory?: Record<string, { min: number; max: number; jobCount: number }>;
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

/** Branch (storefront) under a supplier org — catalog + geo. */
export interface SupplierBranchProfile {
  id: string;
  supplierId: string;
  name: string;
  /** Mirrored from org supplier row in API (`branchToPublicApi`). */
  logo?: string;
  displayName?: string;
  brandName?: string;
  address?: string;
  city?: string;
  area?: string;
  /** Customer-facing; API may mirror branchPhone */
  contactPhone?: string;
  contactEmail?: string;
  hasDelivery: boolean;
  deliveryFee?: number;
  products: Product[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  latitude?: number;
  longitude?: number;
}

/** Supplier storefront + inventory (from GET /supplier/me or nested in /auth/me). */
export interface SupplierAccountProfile {
  id: string;
  name: string;
  logo?: string;
  hasDelivery: boolean;
  deliveryFee?: number;
  /** Legacy; catalog lives on `branches[].products`. */
  products: Product[];
  branches?: SupplierBranchProfile[];
  businessName?: string;
  address?: string;
  /** WGS84 store / warehouse pin (optional — improves nearest-store ordering for customers). */
  latitude?: number;
  longitude?: number;
  phone?: string;
  createdAt?: string;
  createdByAdmin?: boolean;
  userId?: string;
  accountEmail?: string | null;
  loginEmail?: string | null;
  supplierLogo?: string | null;
  displayName?: string | null;
  accountPhone?: string | null;
  role?: string;
}

export interface SupplierUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'supplier';
  createdAt: string;
  supplierProfile: SupplierAccountProfile | null;
}

export interface BranchStaffUser {
  id: string;
  name: string;
  email: string;
  role: 'branch_staff';
  createdAt: string;
  branchId: string;
  supplierOrgId: string;
  branchUserRole?: 'MANAGER' | 'STAFF';
}

export type AuthUser = User | Provider | Admin | SupplierUser | BranchStaffUser;

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
  /** Stock quantity when managed by supplier dashboard */
  quantity?: number;
  description?: string;
  special?: boolean;
  specialEndDate?: string;
  image?: string;
}

export interface Supplier {
  id: string;
  name: string;
  /** Org-level branches (admin dashboard, supplier profile). Catalog lives per branch. */
  branches?: SupplierBranchProfile[];
  /** Brand + branch label from API when set (e.g. "Build It - Bellville"). */
  displayName?: string;
  brandName?: string;
  branchName?: string;
  /** Store city / area for matching customer location (optional). */
  city?: string;
  logo?: string;
  hasDelivery: boolean;
  deliveryFee?: number;
  products: Product[];
  businessName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  createdAt?: string;
  createdByAdmin?: boolean;
  userId?: string;
  linkedUserEmail?: string | null;
  linkedUserName?: string | null;
  linkedUserId?: string | null;
  /** Org id — multiple branches share this. */
  supplierId?: string;
  /** Branch id — same as `id` on branch listing / stores. */
  branchId?: string;
  distanceKm?: number | null;
}

export type MaterialFulfillmentStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'FAILED'
  | 'DELAYED'
  | 'CANCELLED';

/** Canonical batch shape (API payload.materialBatch + jobMaterialOrders). */
export type MaterialBatchStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'delayed'
  | 'cancelled';

export interface MaterialBatchTimestamps {
  acceptedAt?: string;
  readyAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
}

export interface MaterialBatch {
  id: string;
  supplierId: string;
  items: unknown[];
  status: MaterialBatchStatus;
  deliveryType: 'pickup' | 'delivery';
  pickupAddress?: string;
  deliveryAddress?: string;
  assignedDriverId?: string;
  timestamps: MaterialBatchTimestamps;
}

export interface MaterialLine {
  /** Branch fulfilling the line (same as supplierId when using branch architecture). */
  branchId?: string;
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
  /** Set when line came from a submitted material request batch (API / job JSON). */
  materialRequestId?: string;
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
  /** Set when suggestion was withdrawn after acceptance (before payment); allows purge UX. */
  withdrawnAfterAccept?: boolean;
  withdrawnAt?: string;
  withdrawnBy?: 'customer' | 'provider';
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
  /** Links this checkout cycle to a submitted MaterialRequest row (job meta). */
  materialRequestId?: string;
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
  /** Provider list rejected by customer, or cancelled by provider — removable after dismiss. */
  materialBatchResolution?: 'rejected_by_customer' | 'cancelled_by_provider';
  materialBatchRejectedAt?: string;
}

/** DB-backed material purchase order linked to a job (customer paid → supplier fulfills) */
export interface JobMaterialOrderSnapshot {
  id: string;
  jobId?: string | null;
  supplierId?: string | null;
  supplierName?: string;
  customerId?: string;
  providerId?: string | null;
  fulfillmentStatus: MaterialFulfillmentStatus | string;
  paymentStatus: string;
  source?: string;
  /** Job meta `storeOrders[].orderId` when created from job materials pay flow. */
  jobStoreOrderId?: string | null;
  total: number;
  materialsSubtotal: number;
  platformCommission: number;
  supplierEarning: number;
  items: Array<{ name?: string; quantity: number; price: number; productId?: string }>;
  /** Canonical tracking (supplier ↔ customer); same payload as MaterialOrder.materialBatch. */
  materialBatch?: MaterialBatch;
  createdAt: string;
}

export interface Job {
  id: string;
  category: string;
  categoryName: string;
  /** From category record; drives provider step-3 behaviour (measurements vs written requirements). */
  categoryStep3Type?: Category['step3Type'];
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
  /** Monotonic timeline index 0–5; advances on server. */
  progressStep?: number;
  /** Set when first service or material batch is paid; timeline does not return to payment step. */
  hasStarted?: boolean;
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
  /** Persisted MaterialOrder rows for this job (supplier fulfillment) after payment */
  jobMaterialOrders?: JobMaterialOrderSnapshot[];
  /** Per-supplier store checkout orders embedded on the job (API: `storeOrders`) */
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
    /** Provider-authored scope for categories that use items/issue step 3 (non–area-based). */
    requirementText?: string;
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
  | 'support_reply'
  | 'material_tracking'
  | 'supplier_material_order_new'
  | 'supplier_material_order_cancelled'
  | 'material_order_new'
  | 'material_order_cancelled';

export interface AppNotification {
  id: string;
  userId: string;
  type: AppNotificationType;
  title: string;
  message: string;
  read: boolean;
  jobId?: string;
  /** Material order id (supplier portal + branch staff notifications). */
  materialOrderId?: string;
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
  /** From courier provider profile — for customer contact on provider delivery */
  phone?: string;
  email?: string;
}

// Material Order (standalone, not attached to a job)
export interface MaterialOrder {
  id: string;
  userId: string;
  storeId: string;
  /** Branch that fulfills the order (same value as storeId for new API). */
  branchId?: string;
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
  paymentStatus: 'paid' | 'pending' | 'refunded';
  deliveryStatus: 'processing' | 'out_for_delivery' | 'delivered';
  // New nested delivery/payment state; legacy fields above mirror these
  delivery?: OrderDelivery;
  payment?: OrderPayment;
  invoiceId: string;
  deliveryInvoiceId?: string;
  createdAt: string;
  /** Present when an active public tracking session exists */
  activeTrackingId?: string;
  activeTrackingToken?: string;
  cancelledBy?: 'supplier' | 'customer' | string;
  cancellationReason?: string;
  cancelledAt?: string;
  refundStatus?: string;
  refundAmount?: number;
  refundProcessedAt?: string;
  customerLocation?: JobLocation;
  customerAddress?: string;
  /** Customer-facing branch contact (from live Branch row) */
  supplierDisplayName?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  branchContactEmail?: string;
  branchCity?: string;
  branchArea?: string;
  branchHasDelivery?: boolean;
  branchDeliveryFee?: number;
  branchCoordinates?: { lat: number; lng: number };
}
