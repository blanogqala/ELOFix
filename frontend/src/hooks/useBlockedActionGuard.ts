import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { BlockedActionDialogProps } from '@/components/account/BlockedActionDialog';

const BLOCKED_ACTION_MESSAGE = 'Your profile is blocked. View your profile for details.';

export function useBlockedActionGuard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const isBlocked = Boolean(user && 'blocked' in user && user.blocked);
  const blockedReason =
    user && 'blockedReason' in user ? user.blockedReason : undefined;

  const supportHref =
    user?.role === 'provider' ? '/provider/notifications' : '/user/notifications';
  const profileHref =
    user?.role === 'provider' ? '/provider/profile' : '/user/profile';

  const showPayBalance =
    user?.role === 'provider' &&
    (Boolean(user.refundDebtBlockedAt) || /refund debt/i.test(blockedReason || ''));

  const dialogProps: BlockedActionDialogProps = useMemo(
    () => ({
      open,
      onOpenChange: setOpen,
      blockedReason,
      supportHref,
      profileHref,
      payBalanceHref: '/provider/earnings',
      showPayBalance,
    }),
    [open, blockedReason, supportHref, profileHref, showPayBalance],
  );

  const guardAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (isBlocked) {
        setOpen(true);
        return;
      }
      void action();
    },
    [isBlocked],
  );

  const openIfBlockedMessage = useCallback(
    (message: string) => {
      if (message.includes(BLOCKED_ACTION_MESSAGE) || /profile is blocked/i.test(message)) {
        setOpen(true);
        return true;
      }
      return false;
    },
    [],
  );

  return {
    isBlocked,
    blockedReason,
    dialogProps,
    guardAction,
    openIfBlockedMessage,
  };
}
