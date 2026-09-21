import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface BlockedActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockedReason?: string;
  supportHref: string;
  profileHref: string;
  payBalanceHref?: string;
  showPayBalance?: boolean;
}

export function BlockedActionDialog({
  open,
  onOpenChange,
  blockedReason,
  supportHref,
  profileHref,
  payBalanceHref,
  showPayBalance,
}: BlockedActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
          </div>
          <DialogTitle className="text-center">Action restricted</DialogTitle>
          <DialogDescription className="text-center">
            {blockedReason?.trim() ||
              'Your account has been restricted. You can still browse the app, but this action is not available.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <Link to={supportHref} onClick={() => onOpenChange(false)}>
              Contact support
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={profileHref} onClick={() => onOpenChange(false)}>
              View profile
            </Link>
          </Button>
          {showPayBalance && payBalanceHref ? (
            <Button asChild variant="secondary" className="w-full">
              <Link to={payBalanceHref} onClick={() => onOpenChange(false)}>
                Pay outstanding balance
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
