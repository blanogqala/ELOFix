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
  blocked?: boolean;
  blockedReason?: string;
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
  hasSaIdNumber?: boolean;
  companyRegistrationNumber?: string;
  fraudReviewStatus?: 'NONE' | 'PENDING_REVIEW' | 'CLEARED' | 'REJECTED';
  trustScore?: number;
  trustLevel?: { id: string; label: string; score?: number };
  verificationSummary?: {
    verifiedId: boolean;
    verifiedCompany: boolean;
    verifiedBankAccount: boolean;
    trustScore: number;
    trustLevel: { id: string; label: string };
    jobsCompleted: number;
    customerSatisfaction: number;
  };
  vehicleType?: string;
  numberPlate?: string;
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
    proofOfAddress?: {
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
    certifications?: {
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
  /** Count of completed-job reviews (ProviderReview). */
  totalReviews?: number;
  ratingBreakdown?: ProviderRatingBreakdown;
  completedJobs: number;
  responseTime: string;
  bio?: string;
  yearsExperience?: number;
  certifications?: string[];
  reviews?: ProviderReview[];
  createdAt: string;
  blocked?: boolean;
  blockedReason?: string;
  blockedAt?: string;
  refundDebtBlockedAt?: string;
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

export type ProviderRatingBreakdown = Record<0 | 1 | 2 | 3 | 4 | 5, number>;

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
  images?: string[];
  videos?: string[];
  disputeImages?: string[];
  disputeVideos?: string[];
  wasDisputed?: boolean;
  resolvedAfterDispute?: boolean;
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
  /** Per-supplier completed + paid order analytics (admin list). */
  orderAnalytics?: {
    orderCount: number;
    totalRevenue: number;
    totalCommission: number;
    averageOrderValue: number;
    commissionRate: number;
  };
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
  | 'COLLECTING'
  | 'COLLECTED'
  | 'AT_DESTINATION'
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
  deliveryItems?: Array<{ name: string; qty: number; weightKg?: number }>;
  collectionPoint?: { address?: string; city?: string; area?: string; suburb?: string };
  destinationPoint?: { address?: string; city?: string; area?: string; suburb?: string };
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

export type JobStatus = 'PENDING' | 'ASSIGNED' | 'INSPECTED' | 'SERVICE_PRICE_SUBMITTED' | 'SERVICE_PAID' | 'MATERIALS_SUBMITTED' | 'MATERIALS_PAID' | 'IN_PROGRESS' | 'AWAITING_CONFIRMATION' | 'DISPUTED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';

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
  | 'Quoted'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'InProgress'
  | 'Processing'
  | 'OnTheWay'
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
  | 'Quoted'
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
  metro?: string;
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
  /** Courier job created for provider delivery of this material batch */
  courierJobId?: string;
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
  refundStatus?: string;
  refundAmount?: number;
  refundProcessedAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  /** Mirrors material order payload — used when job meta storeOrders is stale. */
  deliveryType?: string;
  deliveryFee?: number;
  deliveryQuote?: { fee?: number; note?: string };
  delivery?: OrderDelivery;
  payment?: OrderPayment;
  deliveryStatus?: string;
  courierJobId?: string | null;
  courierFulfillmentStatus?: string | null;
}

export interface Job {
  id: string;
  category: string;
  categoryName: string;
  /** From category record; drives provider step-3 behaviour (measurements vs written requirements). */
  categoryStep3Type?: Category['step3Type'];
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
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
  cancellationSource?: 'customer_cancel' | 'customer_changed_provider' | string | null;
  cancelledAt?: string;
  cancelledAtStatus?: JobStatus;
  refundAmount?: number;
  rejectionReason?: string;
  rejectionDetails?: string;
  rejectedAt?: string;
  /** When a provider declines a pending request before assignment */
  rejectedByProviderUserId?: string | null;
  completionConfirmedByUser?: boolean;
  confirmationDeadlineAt?: string | null;
  markedCompleteAt?: string | null;
  disputeId?: string | null;
  /** Persisted MaterialOrder rows for this job (supplier fulfillment) after payment */
  jobMaterialOrders?: JobMaterialOrderSnapshot[];
  /** Per-supplier store checkout orders embedded on the job (API: `storeOrders`) */
  storeOrders?: JobStoreOrder[];
  servicePrice?: { amount: number; note?: string; submittedAt?: string };
  quotationFileUrl?: string | null;
  quotationFileName?: string | null;
  quotationUploadedAt?: string | null;
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
  /** From category; when false, materials workflow is disabled */
  requiresMaterials?: boolean;
  /** Linked standalone delivery request (courier quote flow). */
  deliveryRequestId?: string | null;
  courierFlow?: boolean;
  /** Parent service job when this is a material courier child job */
  parentJobId?: string | null;
  /** Courier delivery pricing/fulfillment snapshot for list views (from API). */
  deliverySummary?: {
    status?: string;
    quotedFee?: number | null;
    fulfillmentStatus?: string | null;
    deliveryPaid?: boolean;
  } | null;
  /** Customer gross (labor) after settlement; source of truth from API */
  totalPrice?: number;
  /** Total paid by customer (labor + materials); from API */
  customerPaidTotal?: number;
  commissionAmount?: number;
  providerAmount?: number;
  /** Cumulative amount released to provider (not platform fee) */
  releasedAmount?: number;
  /** Provider share not yet released */
  remainingAmount?: number;
  /** Admin payment settlement bucket from API */
  paymentSettlementStatus?: 'released' | 'held' | 'pending' | 'refund';
  /** Refund status/kind when job was cancelled after payment */
  refundStatus?: string;
  /** Per-refund breakdown from admin processing (includes staged refund split). */
  refundDetails?: {
    customerNet?: number;
    materialsNet?: number;
    escrowApplied?: number;
    clawbackApplied?: number;
    providerDebtAdded?: number;
    /** Portion refunded to the customer immediately (escrow + clawback). */
    immediateRefund?: number;
    /** Portion still being recovered from the provider (staged payout). */
    pendingRefund?: number;
    cumulativeCustomerNet?: number;
    processedAt?: string | null;
  };
  providerRefundDebt?: number;
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
  | 'confirmation_needed'
  | 'job_marked_complete'
  | 'dispute_opened'
  | 'dispute_under_investigation'
  | 'refund_approved'
  | 'case_closed'
  | 'payment_released'
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
  | 'courier_delivery_request'
  | 'delivery_quote'
  | 'delivery_completed'
  | 'provider_approved'
  | 'provider_application_submitted'
  | 'provider_application_rejected'
  | 'provider_application_unrejected'
  | 'provider_document_rejected'
  | 'provider_review_received'
  | 'admin_provider_application_submitted'
  | 'fraud_alert'
  | 'fraud_review'
  | 'admin_repayment_submitted'
  | 'admin_refund_debt_overdue'
  | 'refund_processed'
  | 'refund_clawback'
  | 'refund_no_payout'
  | 'refund_partial'
  | 'refund_staged_payout'
  | 'refund_debt_due'
  | 'refund_debt_reminder'
  | 'refund_debt_overdue'
  | 'refund_recovery_delayed'
  | 'repayment_submitted'
  | 'repayment_confirmed'
  | 'repayment_rejected'
  | 'withdrawal_approved'
  | 'withdrawal_paid'
  | 'withdrawal_failed'
  | 'category_suggestion'
  | 'support_contact'
  | 'job_chat'
  | 'support_reply'
  | 'material_tracking'
  | 'supplier_material_order_new'
  | 'supplier_material_order_cancelled'
  | 'material_order_new'
  | 'material_order_cancelled'
  | 'material_order_customer_issue'
  | 'supplier_account_ready'
  | 'account_blocked'
  | 'account_unblocked';

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
  branchUserId?: string;
  supportTargetUserId?: string;
  conversationId?: string;
  createdAt: string;
  senderId?: string;
  senderName?: string;
  senderRole?: string;
}

export interface JobCompletionEvidence {
  id: string;
  jobId: string;
  customerId: string;
  providerId: string;
  rating: number | null;
  review: string | null;
  images: string[];
  videos: string[];
  verified: boolean;
  autoCompleted: boolean;
  jobCategory: string;
  confirmedAt: string;
  paymentReleasedAt: string | null;
}

export interface JobDisputeRound {
  id: string;
  disputeId: string;
  roundNumber: number;
  status: 'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'CLOSED';
  requestedResolution: 'PROVIDER_RETURN_FIX' | 'REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND' | 'OTHER';
  customerComment: string;
  otherResolutionDetail?: string | null;
  customerImages: string[];
  customerVideos: string[];
  providerComment?: string | null;
  providerImages: string[];
  providerVideos: string[];
  resolutionAction?: string | null;
  resolutionNotes?: string | null;
  openedAt: string;
  resolvedAt?: string | null;
}

export interface JobDispute {
  id: string;
  jobId: string;
  customerId: string;
  providerId: string;
  status: 'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'CLOSED';
  requestedResolution: 'PROVIDER_RETURN_FIX' | 'REFUND' | 'PARTIAL_REFUND' | 'FULL_REFUND' | 'OTHER';
  customerComment: string;
  otherResolutionDetail?: string | null;
  customerImages: string[];
  customerVideos: string[];
  providerComment?: string | null;
  providerImages: string[];
  providerVideos: string[];
  adminNotes?: string | null;
  openedAt: string;
  resolvedAt?: string | null;
  customerName?: string;
  providerName?: string;
  messages?: Array<{
    id: string;
    senderId: string;
    senderRole: string;
    senderName?: string;
    body: string;
    attachments: string[];
    createdAt: string;
  }>;
  resolutionLogs?: Array<{
    id: string;
    adminId: string;
    action: string;
    amount: number | null;
    notes: string | null;
    createdAt: string;
  }>;
  rounds?: JobDisputeRound[];
  job?: {
    id: string;
    title?: string;
    categoryName?: string;
    status?: string;
    cancellationSource?: string | null;
  } | null;
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
  materialsSubtotal?: number;
  platformCommission?: number;
  supplierEarning?: number;
  finance?: {
    materialsSubtotal: number;
    deliveryFee: number;
    orderGross: number;
    platformCommission: number;
    supplierNet: number;
    commissionBasis: 'materials_only' | 'materials_plus_delivery';
    deliveryPaid?: boolean;
    materialsPaid?: boolean;
    deliveryType?: string;
  };
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
  jobId?: string;
  fulfillmentStatus?: string;
  materialBatch?: MaterialBatch | null;
  collectionPoint?: DeliveryGeoPoint;
  destinationPoint?: DeliveryGeoPoint;
  deliveryQuote?: { fee: number; note?: string; submittedAt?: string; providerId?: string; branchStaffId?: string };
  deliveryRejection?: { reason?: string; rejectedAt?: string; branchStaffId?: string };
  source?: string;
  /** Courier job linked to provider delivery for this material order */
  courierJobId?: string | null;
  deliveryConfirmed?: boolean;
  customerIssueFlag?: boolean;
  customerDeliveryIssue?: {
    reason: string;
    details?: string;
    reportedAt: string;
    status: 'open' | 'resolved';
  };
  customerRating?: {
    rating: number;
    comment?: string;
    createdAt?: string;
  };
}

export interface DeliveryGeoPoint {
  address?: string;
  city?: string;
  area?: string;
  suburb?: string;
  label?: string;
  coordinates?: { lat: number; lng: number };
}

export interface DeliveryRequestItem {
  name: string;
  qty: number;
  weightKg?: number;
}

export interface DeliveryRequestRecord {
  id: string;
  customerId: string;
  courierId?: string;
  source?: string;
  jobId?: string;
  materialOrderId?: string;
  category: string;
  description?: string;
  photos: string[];
  items: DeliveryRequestItem[];
  collectionPoint: DeliveryGeoPoint;
  destinationPoint: DeliveryGeoPoint;
  status: string;
  quotedFee?: number;
  quoteNote?: string;
  fulfillmentStatus?: string;
  payment?: { deliveryPaid?: boolean };
  activeTrackingId?: string;
  activeTrackingToken?: string;
  driverLocation?: { lat: number; lng: number; updatedAt?: string };
  courierPhase?: string;
  deliveryConfirmed?: boolean;
  deliveryConfirmedAt?: string;
  customerRating?: {
    rating: number;
    comment?: string;
    createdAt?: string;
  };
  customerCompletion?: {
    confirmedAt?: string;
    ratedAt?: string;
    rating?: number;
    comment?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface AdminCustomerJobCounts {
  total: number;
  completed: number;
  active: number;
  disputed: number;
  rejected: number;
  cancelled: number;
}

export interface AdminCustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profileImage: string | null;
  authProvider: string;
  blocked: boolean;
  deletedAt: string | null;
  city: string | null;
  registeredAt: string;
  jobCounts: AdminCustomerJobCounts;
  servicesRequested: string[];
  totalPaid: number;
}

export interface AdminCustomerProviderSummary {
  id: string;
  name: string;
  email: string;
  businessName: string | null;
}

export interface AdminCustomerMaterialStore {
  branchId: string;
  branchName: string;
  branchCity: string | null;
  supplierId: string;
  supplierName: string;
  orderCount: number;
  totalSpent: number;
}

export interface AdminCustomerJobRow {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  status: JobStatus;
  createdAt: string;
  siteAddress: string;
  totalPaid: number;
  /** Net labour refund returned to customer (when job was cancelled / refunded). */
  refundAmount?: number;
  providerId: string | null;
  provider: AdminCustomerProviderSummary | null;
}

export interface AdminCustomerDetail extends AdminCustomerListItem {
  cities: string[];
  topMaterialStore: AdminCustomerMaterialStore | null;
  materialStores: AdminCustomerMaterialStore[];
  jobs: AdminCustomerJobRow[];
}
