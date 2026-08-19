import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { BlockedActionDialogProps } from '@/components/account/BlockedActionDialog';

const BLOCKED_ACTION_MESSAGE = 'Your profile is blocked. View your profile for details.';

export function useBlockedActionGuard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const isBlocked = Boolean(user && 'blocked' in user && user.blocked);
  const marketplaceRestricted = Boolean(
    user && 'marketplaceRestricted' in user && user.marketplaceRestricted
  );
  const legalStale = Boolean(
    user && 'legalStatus' in user && user.legalStatus && user.legalStatus.current === false
  );
  const isTransactionRestricted = isBlocked || marketplaceRestricted || legalStale;
  const blockedReason =
    user && 'marketplaceRestrictedReason' in user && user.marketplaceRestrictedReason
      ? String(user.marketplaceRestrictedReason)
      : user && 'blockedReason' in user
        ? user.blockedReason
        : legalStale
          ? 'Updated legal documents must be accepted before starting a new marketplace transaction.'
          : undefined;

  const supportHref =
    user?.role === 'provider' ? '/provider/notifications' : '/user/notifications';
  const profileHref =
    user?.role === 'provider' ? '/provider/profile' : '/user/profile';

  const showPayBalance =
    (user?.role === 'provider' &&
      (Boolean(user.refundDebtBlockedAt) || /refund debt|refund repayment/i.test(blockedReason || ''))) ||
    (user?.role === 'user' && marketplaceRestricted);

  const dialogProps: BlockedActionDialogProps = useMemo(
    () => ({
      open,
      onOpenChange: setOpen,
      blockedReason,
      supportHref,
      profileHref,
      payBalanceHref: user?.role === 'provider' ? '/provider/earnings' : '/user/payments',
      showPayBalance,
    }),
    [open, blockedReason, supportHref, profileHref, showPayBalance, user?.role],
  );

  const guardAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (isTransactionRestricted) {
        setOpen(true);
        return;
      }
      void action();
    },
    [isTransactionRestricted],
  );

  const openIfBlockedMessage = useCallback(
    (message: string) => {
      if (
        message.includes(BLOCKED_ACTION_MESSAGE) ||
        /profile is blocked/i.test(message) ||
        /marketplace transactions are restricted/i.test(message) ||
        /legal documents must be accepted/i.test(message)
      ) {
        setOpen(true);
        return true;
      }
      return false;
    },
    [],
  );

  return {
    isBlocked: isTransactionRestricted,
    blockedReason,
    dialogProps,
    guardAction,
    openIfBlockedMessage,
  };
}
