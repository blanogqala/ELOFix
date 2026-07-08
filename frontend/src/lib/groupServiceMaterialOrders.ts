import { OrderCardViewModel } from '@/components/orders/OrderCard';

export interface ServiceJobMaterialGroup {
  jobId: string;
  jobTitle: string | null;
  providerName: string | null;
  orders: OrderCardViewModel[];
  orderCount: number;
  totalAmount: number;
  latestCreatedAt: string;
}

function sortOrdersNewestFirst(orders: OrderCardViewModel[]): OrderCardViewModel[] {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function groupServiceMaterialOrdersByJob(orders: OrderCardViewModel[]): ServiceJobMaterialGroup[] {
  const byJobId = new Map<string, OrderCardViewModel[]>();

  for (const order of orders) {
    const jobId = order.jobId != null ? String(order.jobId).trim() : '';
    if (!jobId) continue;

    const existing = byJobId.get(jobId);
    if (existing) {
      existing.push(order);
    } else {
      byJobId.set(jobId, [order]);
    }
  }

  const groups: ServiceJobMaterialGroup[] = [];

  for (const [jobId, jobOrders] of byJobId) {
    const sorted = sortOrdersNewestFirst(jobOrders);
    const latest = sorted[0];
    const totalAmount = sorted.reduce((sum, o) => sum + Number(o.total || 0), 0);

    groups.push({
      jobId,
      jobTitle: latest?.jobTitle?.trim() || null,
      providerName: latest?.providerName?.trim() || null,
      orders: sorted,
      orderCount: sorted.length,
      totalAmount,
      latestCreatedAt: latest?.createdAt ?? '',
    });
  }

  return groups.sort(
    (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
  );
}
