import type { AdminAnalyticsResponse } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

type AnalyticsChartsGridProps = {
  data: AdminAnalyticsResponse;
};

const revenueConfig: ChartConfig = {
  amount: { label: 'Revenue', color: 'hsl(var(--primary))' },
};

const jobsConfig: ChartConfig = {
  count: { label: 'Jobs', color: 'hsl(var(--primary))' },
};

const usersConfig: ChartConfig = {
  customers: { label: 'Customers', color: 'hsl(217 91% 60%)' },
  providers: { label: 'Providers', color: 'hsl(142 70% 40%)' },
};

const disputesConfig: ChartConfig = {
  opened: { label: 'Opened', color: 'hsl(var(--destructive))' },
  resolved: { label: 'Resolved', color: 'hsl(142 70% 40%)' },
};

const queueConfig: ChartConfig = {
  count: { label: 'Pending', color: 'hsl(38 92% 50%)' },
};

function mergeUserGrowth(data: AdminAnalyticsResponse) {
  const map = new Map<string, { date: string; customers: number; providers: number }>();
  (data.customersByDay ?? []).forEach(({ date, count }) => {
    map.set(date, { date, customers: count, providers: 0 });
  });
  (data.providersByDay ?? []).forEach(({ date, count }) => {
    const existing = map.get(date) ?? { date, customers: 0, providers: 0 };
    existing.providers = count;
    map.set(date, existing);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card-elevated p-4 sm:p-5 space-y-3 transition-shadow hover:shadow-md ${className ?? ''}`}>
      <div>
        <h3 className="font-semibold text-sm sm:text-base">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function AnalyticsChartsGrid({ data }: AnalyticsChartsGridProps) {
  const userGrowth = mergeUserGrowth(data);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Revenue Trends" subtitle="Gross customer payments by day">
        <ChartContainer config={revenueConfig} className="h-[260px] w-full aspect-auto">
          <AreaChart data={data.revenueByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />
              }
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--color-amount)"
              fill="var(--color-amount)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Job Volume" subtitle="Jobs created per day">
        <ChartContainer config={jobsConfig} className="h-[260px] w-full aspect-auto">
          <BarChart data={data.jobsByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="User Growth" subtitle="New customer and provider registrations">
        <ChartContainer config={usersConfig} className="h-[260px] w-full aspect-auto">
          <LineChart data={userGrowth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="customers" stroke="var(--color-customers)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="providers" stroke="var(--color-providers)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Provider Growth" subtitle="New provider signups per day">
        <ChartContainer config={jobsConfig} className="h-[260px] w-full aspect-auto">
          <LineChart data={data.providersByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="count" stroke="hsl(142 70% 40%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Supplier Growth" subtitle="New supplier registrations">
        <ChartContainer config={jobsConfig} className="h-[260px] w-full aspect-auto">
          <BarChart data={data.suppliersByDay ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="hsl(187 85% 43%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Disputes" subtitle="Opened vs resolved per day">
        <ChartContainer config={disputesConfig} className="h-[260px] w-full aspect-auto">
          <BarChart data={data.disputesByDay ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="opened" fill="var(--color-opened)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Verification Queue" subtitle="Providers awaiting approval" className="lg:col-span-2">
        <ChartContainer config={queueConfig} className="h-[240px] w-full aspect-auto">
          <AreaChart data={data.verificationQueueByDay ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              fill="var(--color-count)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>
    </div>
  );
}
