import type { ProviderEarningJobRow, ProviderSettlementRecord } from '@/lib/api/providerAccount';

const STAGE_ORDER: Record<string, number> = {
  DEPOSIT: 0,
  FULL_UPFRONT: 1,
  COMPLETION: 2,
  FULL_COMPLETION: 3,
};

export type SettlementJobGroup = {
  jobId: string;
  jobTitle: string;
  jobCategory: string | null;
  customerName: string | null;
  stages: ProviderSettlementRecord[];
  totalCustomerPaid: number;
  totalProviderShare: number;
  totalCommission: number;
  stagesPaid: number;
  stagesExpected: number | null;
  providerShareRemaining: number | null;
  settlementLabel: 'Fully settled' | 'Partially settled' | 'Pending';
};

function stageRank(paymentType: string | null | undefined): number {
  const key = String(paymentType || '').toUpperCase();
  return STAGE_ORDER[key] ?? 50;
}

function nearlyZero(n: number): boolean {
  return Math.abs(Number(n) || 0) < 0.005;
}

/**
 * Group authoritative settlement records by jobId.
 * Does not invent amounts — only aggregates existing intent rows.
 */
export function groupSettlementRecordsByJob(
  records: ProviderSettlementRecord[],
  jobs: ProviderEarningJobRow[] = []
): SettlementJobGroup[] {
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const byJob = new Map<string, ProviderSettlementRecord[]>();

  for (const rec of records) {
    const jid = String(rec.jobId || '').trim();
    if (!jid) continue;
    const list = byJob.get(jid) || [];
    list.push(rec);
    byJob.set(jid, list);
  }

  const groups: SettlementJobGroup[] = [];
  for (const [jobId, stagesRaw] of byJob) {
    const stages = [...stagesRaw].sort((a, b) => {
      const ra = stageRank(a.paymentType);
      const rb = stageRank(b.paymentType);
      if (ra !== rb) return ra - rb;
      return String(a.paidAt).localeCompare(String(b.paidAt));
    });

    const job = jobById.get(jobId);
    const totalCustomerPaid = stages.reduce((s, r) => s + (Number(r.customerAmount) || 0), 0);
    const totalProviderShare = stages.reduce((s, r) => s + (Number(r.providerShare) || 0), 0);
    const totalCommission = stages.reduce((s, r) => s + (Number(r.commissionAmount) || 0), 0);
    const stagesPaid = stages.length;

    let stagesExpected: number | null = null;
    if (job?.paymentSummary?.deposit || job?.paymentSummary?.completion) {
      stagesExpected =
        (job.paymentSummary.deposit ? 1 : 0) + (job.paymentSummary.completion ? 1 : 0);
    } else if (String(job?.paymentProgress || '') === 'FULLY_PAID' || stagesPaid >= 2) {
      stagesExpected = Math.max(2, stagesPaid);
    } else if (stagesPaid === 1) {
      const t = String(stages[0].paymentType || '').toUpperCase();
      stagesExpected = t === 'DEPOSIT' ? 2 : 1;
    }

    const remaining =
      job?.providerShareRemaining != null ? Number(job.providerShareRemaining) : null;

    let settlementLabel: SettlementJobGroup['settlementLabel'] = 'Pending';
    if (remaining != null && nearlyZero(remaining) && stagesPaid > 0) {
      settlementLabel = 'Fully settled';
    } else if (stagesExpected != null && stagesPaid >= stagesExpected && stagesPaid > 0) {
      settlementLabel = 'Fully settled';
    } else if (stagesPaid > 0) {
      settlementLabel = 'Partially settled';
    }

    const first = stages[0];
    groups.push({
      jobId,
      jobTitle: first.jobTitle || job?.title || job?.category || 'Service',
      jobCategory: first.jobCategory || job?.category || null,
      customerName: first.customerName || job?.customerName || null,
      stages,
      totalCustomerPaid,
      totalProviderShare,
      totalCommission,
      stagesPaid,
      stagesExpected,
      providerShareRemaining: remaining,
      settlementLabel,
    });
  }

  groups.sort((a, b) => {
    const aLatest = a.stages[a.stages.length - 1]?.paidAt || '';
    const bLatest = b.stages[b.stages.length - 1]?.paidAt || '';
    return String(bLatest).localeCompare(String(aLatest));
  });

  return groups;
}

export function countPaidSettlementStages(groups: SettlementJobGroup[]): {
  paid: number;
  expected: number;
} {
  let paid = 0;
  let expected = 0;
  for (const g of groups) {
    paid += g.stagesPaid;
    expected += g.stagesExpected != null ? g.stagesExpected : g.stagesPaid;
  }
  return { paid, expected };
}

export function formatSettlementStageLabel(paymentType: string | null | undefined): string {
  switch (String(paymentType || '').toUpperCase()) {
    case 'DEPOSIT':
      return 'Deposit';
    case 'COMPLETION':
      return 'Completion';
    case 'FULL_UPFRONT':
      return 'Full upfront';
    case 'FULL_COMPLETION':
      return 'Full completion';
    default:
      return String(paymentType || 'Payment').replace(/_/g, ' ');
  }
}
