import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Landmark } from 'lucide-react';
import { bankOnboardingDismissKey } from '@/lib/branchSettlementDisplay';

type BranchBankOnboardingModalProps = {
  open: boolean;
  branchId: string;
  onDismissSession: () => void;
};

export function BranchBankOnboardingModal({
  open,
  branchId,
  onDismissSession,
}: BranchBankOnboardingModalProps) {
  const bankDetailsUrl = `/supplier/earnings/branch/${encodeURIComponent(branchId)}?tab=bank-details`;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(bankOnboardingDismissKey(branchId), '1');
    } catch {
      /* ignore */
    }
    onDismissSession();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Complete your banking details
          </DialogTitle>
          <DialogDescription>
            Complete your banking details to receive payments for material orders. After saving, verification
            stays pending until a marketplace-capable payment gateway confirms your account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button asChild className="w-full">
            <Link to={bankDetailsUrl}>Add banking details</Link>
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={handleDismiss}>
            Remind me later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BranchBankOnboardingBanner({ branchId }: { branchId: string }) {
  const bankDetailsUrl = `/supplier/earnings/branch/${encodeURIComponent(branchId)}?tab=bank-details`;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm text-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Complete your banking details to receive payments for material orders.</span>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-600/40">
        <Link to={bankDetailsUrl}>Add banking details</Link>
      </Button>
    </div>
  );
}
