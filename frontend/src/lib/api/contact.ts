import apiClient from '@/api/client';

export interface ContactFormPayload {
  firstName: string;
  lastName: string;
  email: string;
  cellphone: string;
  message: string;
}

export async function postContactForm(payload: ContactFormPayload): Promise<void> {
  await apiClient.post('/contact', payload);
}
