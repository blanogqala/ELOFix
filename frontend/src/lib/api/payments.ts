import { SavedCard, Invoice } from '@/types';
import apiClient from '@/api/client';

interface CardsResponse {
  success: boolean;
  cards: SavedCard[];
}

interface CardResponse {
  success: boolean;
  card: SavedCard;
}

interface InvoicesResponse {
  success: boolean;
  invoices: Invoice[];
}

interface InvoiceResponse {
  success: boolean;
  invoice: Invoice | null;
}

export async function getSavedCards(userId: string): Promise<SavedCard[]> {
  const { data } = await apiClient.get<CardsResponse>('/payments/cards', { params: { userId } });
  return Array.isArray(data?.cards) ? data.cards : [];
}

export async function addCard(userId: string, cardData: {
  number: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
}): Promise<SavedCard> {
  const { data } = await apiClient.post<CardResponse>('/payments/cards', { userId, ...cardData });
  if (!data?.card) throw new Error('Failed to add card');
  return data.card;
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
