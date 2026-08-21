import { SavedCard, Invoice } from '@/types';
import apiClient from '@/api/client';

export type PaymentProvider = 'PAYFAST' | 'PAYFLEX' | 'PAYJUSTNOW';
export type PaymentIntentKind = 'LABOR' | 'MATERIAL_ORDER' | 'JOB_STORE_ORDER' | 'DELIVERY_FEE';

export interface PaymentIntent {
  id: string;
  merchantReference: string;
  provider: PaymentProvider;
  kind: PaymentIntentKind;
  userId: string;
  jobId?: string | null;
  materialOrderId?: string | null;
  amount: number;
  currency: string;
  state: string;
  escrowStatus: string;
  providerPayoutStatus: string;
  gatewayTransactionId?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CheckoutPayload {
  type: 'redirect';
  url: string;
  formFields?: Record<string, string>;
  method?: 'POST' | 'GET';
}

function idempotencyHeaders(): { 'Idempotency-Key': string } {
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { 'Idempotency-Key': uuid };
}

interface CardsResponse {
  success: boolean;
  cards: SavedCard[];
}

interface InvoicesResponse {
  success: boolean;
  invoices: Invoice[];
}

interface InvoiceResponse {
  success: boolean;
  invoice: Invoice | null;
}

/**
 * Legacy metadata-only card rows (last4/brand/expiry). Not PSP-vaulted tokens.
 * Raw PAN/CVV must never be submitted to EloFix — use PSP hosted checkout / future tokenisation.
 */
export async function getSavedCards(userId: string): Promise<SavedCard[]> {
  const { data } = await apiClient.get<CardsResponse>('/payments/cards', { params: { userId } });
  return Array.isArray(data?.cards) ? data.cards : [];
}

export async function deleteCard(userId: string, cardId: string): Promise<void> {
  await apiClient.delete(`/payments/cards/${cardId}`, { params: { userId } });
}

export async function setDefaultCard(userId: string, cardId: string): Promise<void> {
  await apiClient.patch(`/payments/cards/${cardId}/default`, { userId });
}

export async function getInvoices(userId: string): Promise<Invoice[]> {
  const { data } = await apiClient.get<InvoicesResponse>('/payments/invoices', { params: { userId } });
  return Array.isArray(data?.invoices) ? data.invoices : [];
}

export async function getInvoiceById(userId: string, invoiceId: string): Promise<Invoice | null> {
  const { data } = await apiClient.get<InvoiceResponse>(`/payments/invoices/${invoiceId}`, {
    params: { userId },
  });
  return data?.invoice ?? null;
}

export async function createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt'>): Promise<Invoice> {
  const { data } = await apiClient.post<InvoiceResponse>('/payments/invoices', invoice);
  if (!data?.invoice) throw new Error('Failed to create invoice');
  return data.invoice;
}

export async function getPaymentProviders(): Promise<PaymentProvider[]> {
  const { data } = await apiClient.get<{ success: boolean; providers: string[] }>('/payments/providers');
  return (data?.providers || []) as PaymentProvider[];
}

export async function createPaymentIntent(input: {
  kind: PaymentIntentKind;
  provider: PaymentProvider;
  amount?: number;
  jobId?: string;
  materialOrderId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
  /** Transaction-specific Refund / Delivery policy acceptance (FNB checkout) */
  legalAcceptance: {
    refundPolicyAccepted: boolean;
    refundPolicyVersion: string;
    deliveryPolicyAcknowledged: boolean;
    deliveryPolicyVersion: string | null;
  };
}): Promise<{ intentId: string; merchantReference: string; intent: PaymentIntent; checkout: CheckoutPayload }> {
  const { data } = await apiClient.post<{
    success: boolean;
    intentId: string;
    merchantReference: string;
    intent: PaymentIntent;
    checkout: CheckoutPayload;
  }>('/payments/intents', input, { headers: idempotencyHeaders() });
  if (!data?.checkout?.url) {
    throw new Error('Failed to start payment checkout');
  }
  return {
    intentId: data.intentId,
    merchantReference: data.merchantReference,
    intent: data.intent,
    checkout: data.checkout,
  };
}

export async function getPaymentIntent(intentId: string): Promise<PaymentIntent> {
  const { data } = await apiClient.get<{ success: boolean; intent: PaymentIntent }>(
    `/payments/intents/${intentId}`
  );
  if (!data?.intent) throw new Error('Payment not found');
  return data.intent;
}

export async function confirmPaymentReturn(intentId: string): Promise<{
  intent: PaymentIntent;
  message: string;
}> {
  const { data } = await apiClient.post<{
    success: boolean;
    intent: PaymentIntent;
    message: string;
  }>(`/payments/intents/${intentId}/confirm-return`);
  return { intent: data.intent, message: data.message };
}

export async function processAdminJobRefund(
  jobId: string,
  payload: { laborRefundNet: number; materialsRefundNet?: number }
): Promise<import('@/types').Job> {
  const { data } = await apiClient.post<{ success: boolean; job: import('@/types').Job }>(
    `/admin/jobs/${jobId}/refund`,
    {
      laborRefundNet: payload.laborRefundNet,
      materialsRefundNet: payload.materialsRefundNet ?? 0,
    },
    { headers: idempotencyHeaders() }
  );
  if (!data?.job) throw new Error('Failed to process refund');
  return data.job;
}

export async function createRefundInvoice(
  userId: string,
  jobId: string,
  laborRefund: number,
  materialsRefund: number,
  cardLast4: string
): Promise<Invoice> {
  const { data } = await apiClient.post<InvoiceResponse>('/payments/invoices/refund', {
    userId,
    jobId,
    laborRefund,
    materialsRefund,
    cardLast4,
  });
  if (!data?.invoice) throw new Error('Failed to create refund invoice');
  return data.invoice;
}
