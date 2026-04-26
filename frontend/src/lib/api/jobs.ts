import {
  Invoice,
  Job,
  JobStatus,
  MaterialLine,
  Measurements,
  OrderDelivery,
  ServiceRequest,
  StoreOrderDeliveryStatus,
  StoreOrderDeliveryType,
} from '@/types';
import apiClient from '@/api/client';
import { areaSquareMetersFromAssist } from '@/lib/measurements';

function idempotencyHeaders(): { 'Idempotency-Key': string } {
  const uuid =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { 'Idempotency-Key': uuid };
}

interface BackendJobUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface BackendJob {
  id: string;
  title: string;
  category?: string;
  description: string;
  price: number;
  status: JobStatus | string;
  customerId: string;
  providerId?: string | null;
  customer?: BackendJobUser | null;
  provider?: BackendJobUser | null;
  images?: string[];
  measurements?: Measurements | null;
  materials?: MaterialLine[] | null;
  locationDetails?: Job['location'] | null;
  createdAt: string;
  updatedAt?: string;
  jobNotes?: Job['jobNotes'];
  chat?: Job['chat'];
  laborPaid?: boolean;
  paymentReleased?: boolean;
  servicePrice?: Job['servicePrice'];
  servicePayment?: Job['servicePayment'];
  providerAdjustedRequirements?: Job['providerAdjustedRequirements'];
  userMaterialSuggestions?: Job['userMaterialSuggestions'];
  providerSuggestions?: Job['providerSuggestions'];
  materialPayments?: Job['materialPayments'];
  storeOrders?: Job['storeOrders'];
  proposedLaborPrice?: Job['proposedLaborPrice'];
  completionConfirmedByUser?: boolean;
  userRating?: number;
  userReview?: string;
  cancellationReason?: string;
  cancellationDetails?: string;
  cancelledAt?: string;
  rejectionReason?: string;
  rejectionDetails?: string;
  rejectedAt?: string;
  rejectedByProviderUserId?: string | null;
  escrow?: Job['escrow'];
  requiresInspection?: boolean;
  totalPrice?: number | null;
  commissionAmount?: number | null;
  providerAmount?: number | null;
  /** Job-level amount released to provider (escrow v2) */
  releasedAmount?: number | null;
  remainingAmount?: number | null;
}

interface BackendJobsResponse {
  success: boolean;
  jobs: BackendJob[];
}

interface BackendJobResponse {
  success: boolean;
  job: BackendJob;
}

interface BackendLaborInvoiceResponse {
  success: boolean;
  invoice: Invoice | null;
}

interface BackendCancelResponse {
  success: boolean;
  job: BackendJob;
  refundAmount: number;
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toFrontendJob(job: BackendJob): Job {
  const price = Number(job.price) || 0;
  const totalPriceNum = numOrUndef(job.totalPrice);
  const serviceAmount =
    totalPriceNum != null
      ? totalPriceNum
      : job.servicePrice && typeof job.servicePrice.amount === 'number'
        ? Number(job.servicePrice.amount)
        : price;
  const backendStatus = String(job.status || '').trim().toUpperCase();
  const safeStatus: JobStatus =
    backendStatus === 'ACCEPTED' ? 'ASSIGNED' : ((backendStatus as JobStatus) || 'PENDING');
  const requiresInspection =
    typeof job.requiresInspection === 'boolean' ? job.requiresInspection : true;
  const category = String(job.category || job.title || '').trim();
  const measurements =
    job.measurements && typeof job.measurements === 'object'
      ? job.measurements
      : { source: 'MANUAL', values: {} };
  const materials = Array.isArray(job.materials) ? job.materials : [];
  const images = Array.isArray(job.images) ? job.images : [];
  const locRaw = job.locationDetails;
  const location =
    locRaw && typeof locRaw === 'object' && !Array.isArray(locRaw) ? (locRaw as Job['location']) : undefined;

  return {
    id: job.id,
    category,
    categoryName: category,
    userId: job.customerId,
    userName: job.customer?.name ?? '',
    providerId: job.providerId ?? undefined,
    providerName: job.provider?.name ?? undefined,
    description: String(job.description || ''),
    images,
    measurements,
    materials,
    laborEstimateRange: { min: serviceAmount, max: serviceAmount, unit: 'job' },
    totalEstimateRange: { min: serviceAmount, max: serviceAmount },
    paymentPlan: { type: 'UPFRONT' },
    escrow: job.escrow
      ? {
          enabled: job.escrow.enabled !== false,
          holdPercent: Number(job.escrow.holdPercent) || 0,
          heldAmount: Number(job.escrow.heldAmount) || 0,
          releasedAmount: Number(job.escrow.releasedAmount) || 0,
        }
      : { enabled: true, holdPercent: 0, heldAmount: 0, releasedAmount: 0 },
    status: safeStatus,
    jobNotes: Array.isArray(job.jobNotes) ? job.jobNotes : [],
    chat: Array.isArray(job.chat) ? job.chat : [],
    laborPaid: Boolean(job.laborPaid),
    paymentReleased: Boolean(job.paymentReleased),
    servicePrice: job.servicePrice,
    servicePayment: job.servicePayment,
    providerAdjustedRequirements: job.providerAdjustedRequirements,
    userMaterialSuggestions: Array.isArray(job.userMaterialSuggestions)
      ? job.userMaterialSuggestions
      : [],
    providerSuggestions: Array.isArray(job.providerSuggestions) ? job.providerSuggestions : [],
    materialPayments: Array.isArray(job.materialPayments) ? job.materialPayments : [],
    storeOrders: Array.isArray(job.storeOrders) ? job.storeOrders : [],
    proposedLaborPrice: job.proposedLaborPrice,
    completionConfirmedByUser: Boolean(job.completionConfirmedByUser),
    userRating: job.userRating,
    userReview: job.userReview,
    cancellationReason: job.cancellationReason,
    cancellationDetails: job.cancellationDetails,
    cancelledAt: job.cancelledAt,
    rejectionReason: job.rejectionReason,
    rejectionDetails: job.rejectionDetails,
    rejectedAt: job.rejectedAt,
    rejectedByProviderUserId: job.rejectedByProviderUserId ?? undefined,
    location,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt ?? job.createdAt,
    requiresInspection,
    totalPrice: numOrUndef(job.totalPrice),
    commissionAmount: numOrUndef(job.commissionAmount),
    providerAmount: numOrUndef(job.providerAmount),
    releasedAmount: numOrUndef(job.releasedAmount),
    remainingAmount: numOrUndef(job.remainingAmount),
  };
}

function ensureJob(data: BackendJobResponse, context: string): Job {
  if (!data?.job) throw new Error(`Invalid ${context} response from server`);
  return toFrontendJob(data.job);
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiClient.delete(`/jobs/${jobId}`);
}

export async function addMaterialsToJob(jobId: string, newMaterials: MaterialLine[]): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/materials`, {
    materials: newMaterials,
  });
  return ensureJob(data, 'add materials');
}

export async function removeMaterialFromJob(
  jobId: string,
  productId: string,
  supplierId: string
): Promise<Job> {
  const { data } = await apiClient.delete<BackendJobResponse>(`/jobs/${jobId}/materials`, {
    params: { productId, supplierId },
  });
  return ensureJob(data, 'remove material');
}

export async function createLaborInvoice(
  jobId: string,
  userId: string,
  laborAmount: number,
  cardLast4: string
): Promise<Invoice> {
  const { data } = await apiClient.post<BackendLaborInvoiceResponse>(`/jobs/${jobId}/invoices/labor`, {
    userId,
    laborAmount,
    cardLast4,
  });
  if (!data?.invoice) throw new Error('Invalid create labor invoice response from server');
  return data.invoice;
}

export async function payLabor(
  jobId: string,
  userId: string,
  cardId: string,
  cardLast4: string
): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(
    `/jobs/${jobId}/pay-labor`,
    {
      userId,
      cardId,
      cardLast4,
    },
    { headers: idempotencyHeaders() }
  );
  return ensureJob(data, 'pay labor');
}

export async function releaseEscrowPayment(jobId: string, amount: number): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(
    '/payments/release',
    {
      jobId,
      amount,
    },
    { headers: idempotencyHeaders() }
  );
  return ensureJob(data, 'release escrow payment');
}

export async function addUserMaterialSuggestion(
  jobId: string,
  suggested: MaterialLine,
  message: string
): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/user-material-suggestions`, {
    suggested,
    message,
  });
  return ensureJob(data, 'add user material suggestion');
}

export async function markInspectionDone(jobId: string): Promise<Job> {
  return updateJobStatus(jobId, 'INSPECTED');
}

export async function submitServicePrice(jobId: string, amount: number, note?: string): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/service-price`, {
    amount,
    note,
  });
  return ensureJob(data, 'submit service price');
}

export async function submitMaterials(jobId: string, materials: MaterialLine[]): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/materials/submit`, {
    materials,
  });
  return ensureJob(data, 'submit materials');
}

export async function acceptUserSuggestion(jobId: string, suggestionId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/user-suggestions/${suggestionId}/accept`
  );
  return ensureJob(data, 'accept user suggestion');
}

export async function rejectUserSuggestion(jobId: string, suggestionId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/user-suggestions/${suggestionId}/reject`
  );
  return ensureJob(data, 'reject user suggestion');
}

export async function getJobs(): Promise<Job[]> {
  const { data } = await apiClient.get<BackendJobsResponse>('/jobs');
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map(toFrontendJob);
}

export async function getJobById(id: string): Promise<Job | null> {
  try {
    const { data } = await apiClient.get<BackendJobResponse>(`/jobs/${id}`);
    return data?.job ? toFrontendJob(data.job) : null;
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) return null;
    throw error;
  }
}

export async function getJobsByUser(userId: string): Promise<Job[]> {
  const jobs = await getJobs();
  return jobs.filter((j) => j.userId === userId);
}

export async function getJobsByProvider(providerId: string): Promise<Job[]> {
  const jobs = await getJobs();
  return jobs.filter((j) => j.providerId === providerId);
}

export async function getAssignedJobsForProvider(providerId: string): Promise<Job[]> {
  const jobs = await getJobs();
  return jobs.filter((j) => j.providerId === providerId && j.status === 'ASSIGNED');
}

export async function createJob(request: ServiceRequest, userId: string, userName: string): Promise<Job> {
  if (!request.category?.trim()) throw new Error('Category is required.');
  if (!request.description?.trim()) throw new Error('Description is required.');
  const valuesCount = Object.keys(request.measurements?.values || {}).length;
  const hasMovingItems = (request.measurements?.movingItems?.length || 0) > 0;
  const hasIssueType = Boolean(request.measurements?.plumbingIssue?.type);
  const cam = request.measurements?.cameraAssist;
  const camArea = cam ? areaSquareMetersFromAssist(cam) : undefined;
  const hasCameraAssist =
    cam?.source === 'camera' && camArea !== undefined && camArea >= 0.5;
  if (cam?.source === 'camera' && (camArea === undefined || camArea < 0.5)) {
    throw new Error('Camera measurement must be at least 0.5 m² with valid dimensions.');
  }
  if (!request.measurements || (valuesCount === 0 && !hasMovingItems && !hasIssueType && !hasCameraAssist)) {
    throw new Error('Please provide job requirements before submitting.');
  }

  const valuesPrice = Object.values(request.measurements.values || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
  const movingPrice = (request.measurements.movingItems || []).reduce(
    (sum, item) => sum + (Number(item.weight || 20) * Number(item.qty || 0)),
    0
  );
  const issueFallbackPrice = hasIssueType ? 1 : 0;
  const computedPrice = Math.max(1, valuesPrice || movingPrice || issueFallbackPrice);
  if (computedPrice <= 0) throw new Error('Estimated price must be greater than zero.');

  const payload = {
    title: request.category.trim(),
    category: request.category.trim(),
    description: request.description.trim(),
    price: computedPrice,
    location: request.location,
    images: request.images || [],
    measurements: request.measurements,
    materials: request.materials || [],
    selectedProviderId: request.selectedProviderId,
  };

  void userId;
  void userName;
  const { data } = await apiClient.post<BackendJobResponse>('/jobs', payload);
  return ensureJob(data, 'create job');
}

export async function uploadJobImage(file: File): Promise<string> {
  const { compressImageForUpload } = await import('@/lib/imageCompression');
  const prepared = await compressImageForUpload(file, 1280);
  const formData = new FormData();
  formData.append('file', prepared);
  const { data } = await apiClient.post<{ success: boolean; url?: string }>('/jobs/upload-image', formData);
  if (!data?.success || !data.url) throw new Error('Image upload failed');
  return data.url;
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/status`, { status });
  return ensureJob(data, 'update job status');
}

export async function acceptJob(jobId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/accept`);
  return ensureJob(data, 'accept job');
}

export async function rejectJob(jobId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/reject`);
  return ensureJob(data, 'reject job');
}

export async function rejectJobByProvider(
  jobId: string,
  reason: string,
  details?: string
): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/reject-by-provider`, {
    reason,
    details,
  });
  return ensureJob(data, 'reject job by provider');
}

export async function addProviderMaterialSuggestion(
  jobId: string,
  suggested: MaterialLine,
  message: string
): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/provider-material-suggestions`, {
    suggested,
    message,
  });
  return ensureJob(data, 'add provider material suggestion');
}

export async function getPendingRequestsForProvider(providerId: string): Promise<Job[]> {
  void providerId;
  const { data } = await apiClient.get<BackendJobsResponse>('/jobs/match');
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map(toFrontendJob).filter((job) => job.status === 'PENDING');
}

export async function getRejectedRequestsByProvider(providerId: string): Promise<Job[]> {
  const jobs = await getJobs();
  return jobs.filter(
    (j) =>
      j.status === 'REJECTED' &&
      (j.providerId === providerId || j.rejectedByProviderUserId === providerId)
  );
}

export async function deleteRejectedRequestFromProviderView(providerId: string, jobId: string): Promise<void> {
  void providerId;
  await apiClient.delete(`/jobs/${jobId}/provider-view/rejected`);
}

export async function completeJob(jobId: string): Promise<Job> {
  return updateJobStatus(jobId, 'COMPLETED');
}

export async function addJobNote(jobId: string, message: string, title?: string): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/notes`, { message, title });
  return ensureJob(data, 'add job note');
}

export async function updateProviderRequirements(
  jobId: string,
  updates: { measurements?: Partial<Measurements>; requirementNotes?: string }
): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/provider-requirements`, updates);
  return ensureJob(data, 'update provider requirements');
}

export async function getLaborInvoiceByJobId(jobId: string): Promise<Invoice | null> {
  const { data } = await apiClient.get<BackendLaborInvoiceResponse>(`/jobs/${jobId}/invoices/labor`);
  return data?.invoice ?? null;
}

export async function addChatMessage(jobId: string, message: string): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/chat`, { message });
  return ensureJob(data, 'add chat message');
}

export async function proposeNewLaborPrice(jobId: string, amount: number, reason: string): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/proposed-price`, {
    amount,
    reason,
  });
  return ensureJob(data, 'propose new labor price');
}

export async function acceptProposedPrice(jobId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/proposed-price/accept`);
  return ensureJob(data, 'accept proposed price');
}

export async function cancelJob(
  jobId: string,
  reason: string,
  details: string
): Promise<{ job: Job; refundAmount: number }> {
  const { data } = await apiClient.post<BackendCancelResponse>(`/jobs/${jobId}/cancel`, { reason, details });
  if (!data?.job) throw new Error('Invalid cancel job response from server');
  return { job: toFrontendJob(data.job), refundAmount: Number(data.refundAmount || 0) };
}

export async function confirmJobCompletion(
  jobId: string,
  rating: number,
  review: string
): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(`/jobs/${jobId}/confirm-completion`, {
    rating,
    review,
  });
  return ensureJob(data, 'confirm job completion');
}

export async function setStoreDeliveryOption(
  jobId: string,
  storeId: string,
  params: {
    deliveryType: StoreOrderDeliveryType;
    deliveryFee: number;
    deliveryProviderId?: string;
    orderId?: string;
  }
): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/store-orders/${storeId}/delivery-option`,
    params
  );
  return ensureJob(data, 'set store delivery option');
}

export async function approveStoreDeliveryRequest(jobId: string, storeId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/store-orders/${storeId}/approve-request`
  );
  return ensureJob(data, 'approve store delivery request');
}

export async function updateStoreOrderDeliveryStatus(
  jobId: string,
  storeId: string,
  status: StoreOrderDeliveryStatus
): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/store-orders/${storeId}/delivery-status`,
    { status }
  );
  return ensureJob(data, 'update store delivery status');
}

export async function updateStoreOrderDelivery(
  jobId: string,
  storeId: string,
  updates: Partial<OrderDelivery>
): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/store-orders/${storeId}/delivery`,
    updates
  );
  return ensureJob(data, 'update store order delivery');
}

export async function approveStoreOrderDelivery(jobId: string, storeId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/store-orders/${storeId}/approve`);
  return ensureJob(data, 'approve store order delivery');
}

export async function rejectStoreOrderDelivery(jobId: string, storeId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(`/jobs/${jobId}/store-orders/${storeId}/reject`);
  return ensureJob(data, 'reject store order delivery');
}

export async function payStoreOrderDelivery(
  jobId: string,
  storeId: string,
  cardLast4: string,
  fee: number
): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(
    `/jobs/${jobId}/store-orders/${storeId}/pay-delivery`,
    { cardLast4, fee }
  );
  return ensureJob(data, 'pay store order delivery');
}

export async function payForStoreMaterials(
  jobId: string,
  supplierId: string,
  cardId: string,
  cardLast4: string,
  options?: {
    deliveryType: StoreOrderDeliveryType;
    deliveryFee: number;
    deliveryProviderId?: string;
    orderId?: string;
  }
): Promise<Job> {
  const { data } = await apiClient.post<BackendJobResponse>(
    `/jobs/${jobId}/store-orders/${supplierId}/pay-materials`,
    { cardId, cardLast4, ...options }
  );
  return ensureJob(data, 'pay for store materials');
}

export async function acceptProviderSuggestion(jobId: string, suggestionId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/provider-suggestions/${suggestionId}/accept`
  );
  return ensureJob(data, 'accept provider suggestion');
}

export async function rejectProviderSuggestion(jobId: string, suggestionId: string): Promise<Job> {
  const { data } = await apiClient.patch<BackendJobResponse>(
    `/jobs/${jobId}/provider-suggestions/${suggestionId}/reject`
  );
  return ensureJob(data, 'reject provider suggestion');
}
