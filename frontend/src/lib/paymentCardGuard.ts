import type { SavedCard } from '@/types';
import { getSavedCards } from '@/lib/api/payments';

type ToastFn = (props: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

const NO_CARD_TITLE = 'Payment card required';
const NO_CARD_DESCRIPTION = 'Add a payment card on the Payments page before you can pay.';

export function guardLoadedPaymentCards(savedCards: SavedCard[], toast: ToastFn): boolean {
  if (savedCards.length > 0) return true;
  toast({
    title: NO_CARD_TITLE,
    description: NO_CARD_DESCRIPTION,
    variant: 'destructive',
  });
  return false;
}

export async function guardPaymentCardsForUser(userId: string, toast: ToastFn): Promise<boolean> {
  try {
    const cards = await getSavedCards(userId);
    return guardLoadedPaymentCards(cards, toast);
  } catch {
    toast({
      title: 'Error',
      description: 'Could not verify saved payment cards.',
      variant: 'destructive',
    });
    return false;
  }
}
