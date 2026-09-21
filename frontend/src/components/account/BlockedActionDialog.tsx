import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface BlockedActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockedReason?: string;
  supportHref: string;
  profileHref?: string;
  payBalanceHref?: string;
  showPayBalance?: boolean;
}

export function BlockedActionDialog({
  open,
  onOpenChange,
  blockedReason,
  supportHref,
  payBalanceHref,
  showPayBalance,
}: BlockedActionDialogProps) {
  const reason =
    blockedReason?.trim() ||
    'Your account has been restricted. You can still browse the app, but this action is not available.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
          </div>
          <DialogTitle>Action restricted</DialogTitle>
          <p className="max-w-full text-sm leading-relaxed text-muted-foreground break-words whitespace-normal">
            {reason}
          </p>
        </div>
        <div className="mt-4 flex min-w-0 flex-col gap-2">
          {showPayBalance && payBalanceHref ? (
            <Button asChild className="w-full">
              <Link to={payBalanceHref} onClick={() => onOpenChange(false)}>
                Pay outstanding balance
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="w-full">
            <Link to={supportHref} onClick={() => onOpenChange(false)}>
              Contact support
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
