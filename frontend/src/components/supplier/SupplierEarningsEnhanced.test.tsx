/**
 * @vitest-environment jsdom
 */
import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SupplierEarningsHub, SupplierEarningsOrdersPanel } from '@/components/supplier/SupplierEarningsEnhanced';
import { EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY, type SupplierOrdersExportRow } from '@/lib/api/supplierPortal';

const getSupplierOrdersExport = vi.fn();
const getSupplierMe = vi.fn();
const getSupplierAnalyticsBranches = vi.fn();

vi.mock('@/lib/api/supplierPortal', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/supplierPortal')>(
    '@/lib/api/supplierPortal'
  );
  return {
    ...actual,
    getSupplierOrdersExport: (...args: unknown[]) => getSupplierOrdersExport(...args),
    getSupplierMe: (...args: unknown[]) => getSupplierMe(...args),
    getSupplierAnalyticsBranches: (...args: unknown[]) => getSupplierAnalyticsBranches(...args),
  };
});

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function row(partial: Partial<SupplierOrdersExportRow>): SupplierOrdersExportRow {
  return {
    orderId: 'ord-1',
    branchName: 'Main',
    status: 'COMPLETED',
    settlementStatus: 'PENDING',
    totalAmount: 100,
    commission: 7,
    netEarnings: 93,
    revenueImpact: 100,
    commissionImpact: 7,
    netImpact: 93,
    isCancelled: false,
    isCompletedPaid: true,
    ...partial,
  };
}

describe('SupplierEarningsHub settlement presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupplierMe.mockResolvedValue({ branches: [] });
    getSupplierOrdersExport.mockResolvedValue({
      rows: [
        row({ orderId: 'ord-pending', settlementStatus: 'PENDING' }),
        row({ orderId: 'ord-processing', settlementStatus: 'PROCESSING' }),
        row({ orderId: 'ord-success', settlementStatus: 'SUCCESS' }),
      ],
      summary: {
        ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY,
        orderCount: 3,
        completedCount: 3,
        activeRevenue: 300,
        activeCommission: 21,
        activeNet: 279,
      },
    });
    getSupplierAnalyticsBranches.mockResolvedValue({
      branches: [],
      totalPendingSettlement: 322.68,
      totalSettled: 930,
      needsAttentionAmount: 0,
      pendingUsesGrossFallback: true,
    });
  });

  it('removes Settled by Paystack and still renders Pending settlement from the API', async () => {
    render(wrap(<SupplierEarningsHub userId="user-1" />));

    await waitFor(() => {
      expect(screen.getByText('Pending settlement')).toBeInTheDocument();
    });
    expect(screen.queryByText('Settled by Paystack')).not.toBeInTheDocument();
    expect(screen.getByText('Total revenue')).toBeInTheDocument();
    expect(screen.getByText('Total commission')).toBeInTheDocument();
    expect(screen.getByText('Gross supplier earnings (93%)')).toBeInTheDocument();
    expect(screen.getByText((content) => content.replace(/\s/g, ' ').includes('322,68'))).toBeInTheDocument();
  });

  it('renders a Settlement column with Pending, Processing, and Success badges and aligned subtotals', async () => {
    render(wrap(<SupplierEarningsOrdersPanel userId="user-1" heading="All orders (all branches)" />));

    await waitFor(() => {
      expect(screen.getByText('Settlement')).toBeInTheDocument();
    });
    expect(screen.getByText(/^Pending$/)).toBeInTheDocument();
    expect(screen.getByText(/^Processing$/)).toBeInTheDocument();
    expect(screen.getByText(/^Success$/)).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent);
    expect(headers).toEqual([
      'Branch',
      'Order ID',
      'Status',
      'Settlement',
      'Total',
      'Commission',
      'Net',
      'Refund',
      'Cancelled By',
      'Reason',
    ]);

    const subtotal = screen.getByText(/Active subtotal/);
    expect(subtotal.closest('td')?.getAttribute('colspan')).toBe('4');
  });
});
