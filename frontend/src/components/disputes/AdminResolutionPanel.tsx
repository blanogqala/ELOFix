import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ADMIN_RESOLUTION_ACTIONS,
  ADMIN_RESOLUTION_HELP,
  type AdminResolutionActionValue,
} from '@/lib/adminResolutionActions';
import { formatCurrency } from '@/lib/formatCurrency';

type Props = {
  adminNotes: string;
  onAdminNotesChange: (value: string) => void;
  resolveAction: string;
  onResolveActionChange: (value: AdminResolutionActionValue) => void;
  acting: boolean;
  onInvestigate: () => void | Promise<void>;
  onResolve: () => void | Promise<void>;
  maxRefundable?: number;
};

/**
 * Shared Admin Resolution panel for dispute and cancellation case pages.
 */
export function AdminResolutionPanel({
  adminNotes,
  onAdminNotesChange,
  resolveAction,
  onResolveActionChange,
  acting,
  onInvestigate,
  onResolve,
  maxRefundable = 0,
}: Props) {
  return (
    <div className="card-elevated space-y-4 p-5 sm:p-6">
      <h2 className="font-semibold">Admin resolution</h2>
      <div className="space-y-2">
        <label className="text-sm font-medium">Admin notes</label>
        <Textarea
          value={adminNotes}
          onChange={(e) => onAdminNotesChange(e.target.value)}
          placeholder="Internal notes and decision summary (visible in outcome)"
          rows={3}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={acting} onClick={() => void onInvestigate()}>
          Mark under investigation
        </Button>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Action</label>
        <Select
          value={resolveAction}
          onValueChange={(v) => onResolveActionChange(v as AdminResolutionActionValue)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select action" />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_RESOLUTION_ACTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {ADMIN_RESOLUTION_HELP}
        {maxRefundable > 0
          ? ` Maximum refundable paid amount: ${formatCurrency(maxRefundable, { decimals: 2 })}.`
          : ''}
      </p>
      <Button className="btn-accent" disabled={acting} onClick={() => void onResolve()}>
        Apply resolution
      </Button>
    </div>
  );
}
