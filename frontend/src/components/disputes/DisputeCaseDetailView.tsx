import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { JobDispute, JobDisputeRound } from '@/types';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import {
  formatAdminResolutionAction,
  formatDisputeStatus,
  formatRequestedResolution,
} from '@/lib/disputeLabels';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

function DisputeMediaGrid({ images = [], videos = [] }: { images?: string[]; videos?: string[] }) {
  if (images.length === 0 && videos.length === 0) {
    return <p className="text-sm text-muted-foreground">No media attached</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url) => (
        <a key={url} href={resolveUploadUrl(url)} target="_blank" rel="noreferrer">
          <img src={resolveUploadUrl(url)} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-border" />
        </a>
      ))}
      {videos.map((url) => (
        <video
          key={url}
          src={resolveUploadUrl(url)}
          controls
          className="h-20 w-32 rounded-lg object-cover ring-1 ring-border"
        />
      ))}
    </div>
  );
}

function statusBadgeClass(status: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'RESOLVED' || s === 'CLOSED') return 'bg-success/10 text-success';
  if (s === 'UNDER_INVESTIGATION') return 'bg-warning/10 text-warning';
  return 'bg-destructive/10 text-destructive';
}

function pickDefaultRound(rounds: JobDisputeRound[]): JobDisputeRound | null {
  if (!rounds.length) return null;
  const active = [...rounds].reverse().find((r) => ['OPEN', 'UNDER_INVESTIGATION'].includes(r.status));
  return active || rounds[rounds.length - 1];
}

function roundToView(round: JobDisputeRound, dispute: JobDispute) {
  return {
    status: round.status,
    requestedResolution: round.requestedResolution,
    otherResolutionDetail: round.otherResolutionDetail,
    customerComment: round.customerComment,
    customerImages: round.customerImages,
    customerVideos: round.customerVideos,
    providerComment: round.providerComment,
    providerImages: round.providerImages,
    providerVideos: round.providerVideos,
    openedAt: round.openedAt,
    resolvedAt: round.resolvedAt,
    resolutionAction: round.resolutionAction,
    resolutionNotes: round.resolutionNotes,
    adminNotes: dispute.adminNotes,
  };
}

interface DisputeCaseDetailViewProps {
  dispute: JobDispute;
  messages?: JobDispute['messages'];
  resolutionLogs?: JobDispute['resolutionLogs'];
  rounds?: JobDisputeRound[];
  jobTitle?: string | null;
  footer?: ReactNode;
}

export function DisputeCaseDetailView({
  dispute,
  messages,
  resolutionLogs,
  rounds: roundsProp,
  jobTitle,
  footer,
}: DisputeCaseDetailViewProps) {
  const rounds = useMemo(() => {
    const list = roundsProp ?? dispute.rounds ?? [];
    return [...list].sort((a, b) => a.roundNumber - b.roundNumber);
  }, [roundsProp, dispute.rounds]);

  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);

  useEffect(() => {
    const fallback = pickDefaultRound(rounds);
    setSelectedRoundNumber(fallback?.roundNumber ?? null);
  }, [dispute.id, rounds]);

  const selectedRound =
    rounds.find((r) => r.roundNumber === selectedRoundNumber) ?? pickDefaultRound(rounds);

  const view = selectedRound ? roundToView(selectedRound, dispute) : dispute;
  const requestLabel = formatRequestedResolution(view.requestedResolution, view.otherResolutionDetail);
  const thread = messages ?? dispute.messages ?? [];
  const logs = resolutionLogs ?? dispute.resolutionLogs ?? [];
  const roundResolution =
    selectedRound?.resolutionAction != null
      ? {
          action: selectedRound.resolutionAction,
          notes: selectedRound.resolutionNotes,
          createdAt: selectedRound.resolvedAt || dispute.resolvedAt || '',
        }
      : logs[0];
  const isResolved = ['RESOLVED', 'CLOSED'].includes(String(view.status || '').toUpperCase());
  const hasMultipleRounds = rounds.length > 1;

  return (
    <div className="space-y-6">
      <div className="card-elevated border-l-4 border-l-destructive p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold sm:text-2xl">Dispute #{dispute.id.slice(-8)}</h1>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusBadgeClass(dispute.status))}>
                {formatDisputeStatus(dispute.status)}
              </span>
            </div>
            {jobTitle && <p className="text-sm text-muted-foreground">Job: {jobTitle}</p>}

            {hasMultipleRounds ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Disputes on this job ({rounds.length})</p>
                <ul className="space-y-2">
                  {rounds.map((round) => {
                    const selected = round.roundNumber === selectedRound?.roundNumber;
                    const roundLabel = formatRequestedResolution(
                      round.requestedResolution,
                      round.otherResolutionDetail
                    );
                    return (
                      <li key={round.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRoundNumber(round.roundNumber)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                            selected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border bg-background hover:bg-muted/40'
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              Dispute {round.roundNumber}
                              {selected ? ' · viewing' : ''}
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-medium',
                                statusBadgeClass(round.status)
                              )}
                            >
                              {formatDisputeStatus(round.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Opened {new Date(round.openedAt).toLocaleString()}
                            {round.resolvedAt
                              ? ` · Resolved ${new Date(round.resolvedAt).toLocaleString()}`
                              : ''}
                          </p>
                          <p className="mt-1 text-xs">
                            <span className="text-muted-foreground">Requested:</span>{' '}
                            <span className="font-medium">{roundLabel}</span>
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <>
                <p className="text-sm">
                  <span className="text-muted-foreground">Customer requested:</span>{' '}
                  <span className="font-medium">{requestLabel}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Opened {new Date(view.openedAt).toLocaleString()}
                  {view.resolvedAt ? ` · Resolved ${new Date(view.resolvedAt).toLocaleString()}` : ''}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {hasMultipleRounds && selectedRound && (
        <p className="text-sm text-muted-foreground">
          Showing dispute {selectedRound.roundNumber} of {rounds.length} for this job.
        </p>
      )}

      {isResolved && roundResolution?.action && (
        <div className="card-elevated border-l-4 border-l-success p-5 sm:p-6">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div className="space-y-1">
              <p className="font-semibold text-success">Final decision</p>
              <p className="text-sm">{formatAdminResolutionAction(roundResolution.action)}</p>
              {roundResolution.notes && (
                <p className="text-sm text-muted-foreground">{roundResolution.notes}</p>
              )}
              {view.adminNotes && view.adminNotes !== roundResolution.notes && (
                <p className="text-sm text-muted-foreground">{view.adminNotes}</p>
              )}
              {roundResolution.createdAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(roundResolution.createdAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-elevated space-y-3 p-5 sm:p-6">
          <h2 className="font-semibold">Customer evidence</h2>
          <p className="text-sm font-medium">Requested outcome: {requestLabel}</p>
          {view.requestedResolution === 'OTHER' && view.otherResolutionDetail && (
            <p className="border-l-2 border-muted pl-3 text-sm text-muted-foreground">
              {view.otherResolutionDetail}
            </p>
          )}
          <p className="text-sm">{view.customerComment}</p>
          <DisputeMediaGrid images={view.customerImages} videos={view.customerVideos} />
        </div>

        <div className="card-elevated space-y-3 p-5 sm:p-6">
          <h2 className="font-semibold">Provider response</h2>
          {view.providerComment ? (
            <p className="text-sm">{view.providerComment}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No provider response yet</p>
          )}
          <DisputeMediaGrid images={view.providerImages} videos={view.providerVideos} />
        </div>
      </div>

      <div className="card-elevated p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">Messages</h2>
        {thread.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {thread.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'rounded-lg border border-border p-3 text-sm',
                  m.senderRole === 'ADMIN' && 'border-primary/30 bg-primary/5',
                  m.senderRole === 'PROVIDER' && 'border-accent/30 bg-accent/5',
                  m.senderRole === 'CUSTOMER' && 'bg-muted/30'
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide text-foreground/80">
                    {m.senderRole}
                  </span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        {footer && <div className="mt-4 border-t border-border pt-4">{footer}</div>}
      </div>
    </div>
  );
}
