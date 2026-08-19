import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LegalAgreementCheckbox } from '@/components/legal/LegalAgreementCheckbox';
import { acceptCurrentLegalDocuments } from '@/lib/api/legal';
import { getRequiredDocuments, type LegalAcceptanceRole } from '@/lib/legal/versions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function roleForLegal(role: string | undefined): LegalAcceptanceRole {
  if (role === 'provider') return 'provider';
  if (role === 'supplier' || role === 'branch_staff') return 'supplier';
  return 'user';
}

function isExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith('/legal') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/refund') ||
    pathname.startsWith('/dispute') ||
    pathname.startsWith('/provider-agreement') ||
    pathname.startsWith('/escrow-policy') ||
    pathname.startsWith('/contact') ||
    pathname.includes('/refund') ||
    pathname.includes('/disputes') ||
    pathname.includes('/payments') ||
    pathname.includes('/earnings')
  );
}

export function LegalReacceptanceModal() {
  const { user, refreshProfile } = useAuth();
  const location = useLocation();
  const stale = Boolean(user && 'legalStatus' in user && user.legalStatus && user.legalStatus.current === false);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legalRole = roleForLegal(user?.role);

  useEffect(() => {
    if (!stale) {
      setOpen(false);
      return;
    }
    if (!isExemptPath(location.pathname)) {
      setOpen(true);
    }
  }, [stale, location.pathname]);

  const docs = useMemo(() => getRequiredDocuments(legalRole), [legalRole]);

  if (!user || !stale) return null;

  const handleAccept = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    setError(null);
    try {
      await acceptCurrentLegalDocuments(legalRole);
      await refreshProfile();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record acceptance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Updated legal documents</DialogTitle>
          <DialogDescription>
            Material legal documents have been updated. Please review and accept the documents that apply to
            your role before starting a new marketplace transaction. You can still view existing jobs, disputes,
            invoices, and outstanding payment or repayment pages.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Required for your role: {docs.join(', ')}.</p>
          <LegalAgreementCheckbox role={legalRole} checked={accepted} onCheckedChange={setAccepted} />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Review later
          </Button>
          <Button type="button" disabled={!accepted || saving} onClick={() => void handleAccept()}>
            {saving ? 'Saving…' : 'Accept and continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
