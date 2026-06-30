import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  getAdminCustomerById,
  blockAdminCustomer,
  unblockAdminCustomer,
  deleteAdminCustomer,
} from '@/lib/api/adminCustomers';
import type { AdminCustomerDetail } from '@/types';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  DollarSign,
  Ban,
  Trash2,
  Store,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getStandardizedStatusLabel, getUserStatusBadgeClass } from '@/lib/jobStatusMapping';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AdminCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<AdminCustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!id) return;
    try {
      setCustomer(await getAdminCustomerById(id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load customer.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  const handleBlock = async () => {
    if (!customer || isMutating) return;
    if (!blockReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for blocking this customer.', variant: 'destructive' });
      return;
    }
    try {
      setIsMutating(true);
      setCustomer(await blockAdminCustomer(customer.id, blockReason.trim()));
      toast({
        title: 'Customer blocked',
        description: 'They can still sign in and view history, but cannot create new requests or orders.',
      });
      setBlockModalOpen(false);
      setBlockReason('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to block customer.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUnblock = async () => {
    if (!customer || isMutating) return;
    try {
      setIsMutating(true);
      setCustomer(await unblockAdminCustomer(customer.id));
      toast({ title: 'Customer unblocked', description: 'They can access the platform again.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unblock customer.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!customer || isMutating) return;
    try {
      setIsMutating(true);
      await deleteAdminCustomer(customer.id);
      toast({ title: 'Customer removed', description: 'Account has been soft-deleted from the customer list.' });
      setDeleteModalOpen(false);
      navigate('/admin/customers');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete customer.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const avatarSrc = resolveUploadUrl(customer?.profileImage);

  const accountStatus = customer?.deletedAt
    ? 'Deleted'
    : customer?.blocked
      ? 'Blocked'
      : 'Active';

  const statusClass = customer?.deletedAt || customer?.blocked ? 'status-cancelled' : 'status-completed';

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/customers')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Customer details</h1>
              <p className="text-muted-foreground">Profile, jobs, materials, and moderation</p>
            </div>
          </div>
          {customer && !customer.deletedAt ? (
            <div className="flex flex-wrap gap-2">
              {customer.blocked ? (
                <Button variant="outline" disabled={isMutating} onClick={() => void handleUnblock()}>
                  Unblock customer
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive"
                  disabled={isMutating}
                  onClick={() => setBlockModalOpen(true)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Block customer
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={isMutating}
                onClick={() => setDeleteModalOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete customer
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="card-elevated p-8">
            <div className="mx-auto h-8 w-48 animate-pulse rounded bg-muted" />
          </div>
        ) : !customer ? (
          <div className="card-elevated p-8 text-center text-muted-foreground">
            Customer not found.
          </div>
        ) : (
          <>
            <div className="card-elevated p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{customer.name}</h2>
                    <span className={cn('status-badge', statusClass)}>{accountStatus}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Registered {new Date(customer.registeredAt).toLocaleDateString()}
                    {customer.authProvider === 'GOOGLE' ? ' · Google sign-in' : ''}
                  </p>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {customer.email}
                    </p>
                    {customer.phone ? (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {customer.phone}
                      </p>
                    ) : null}
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {customer.city || customer.cities.join(', ') || '—'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {customer.jobCounts.total} job{customer.jobCounts.total === 1 ? '' : 's'} total
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {[
                { label: 'Completed', value: customer.jobCounts.completed },
                { label: 'Active', value: customer.jobCounts.active },
                { label: 'Disputed', value: customer.jobCounts.disputed },
                { label: 'Rejected', value: customer.jobCounts.rejected },
                { label: 'Total paid', value: formatCurrency(customer.totalPaid), isMoney: true },
              ].map((stat) => (
                <div key={stat.label} className="card-elevated min-w-0 p-4">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p
                    className={cn(
                      'mt-1 font-semibold leading-tight tabular-nums truncate',
                      stat.isMoney && 'text-base sm:text-lg lg:text-xl',
                    )}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="card-elevated p-6">
              <div className="mb-4 flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Material purchases</h3>
              </div>
              {customer.topMaterialStore ? (
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Shops from most often
                  </p>
                  <p className="mt-1 font-medium">
                    {customer.topMaterialStore.supplierName} — {customer.topMaterialStore.branchName}
                    {customer.topMaterialStore.branchCity
                      ? ` (${customer.topMaterialStore.branchCity})`
                      : ''}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {customer.topMaterialStore.orderCount} paid order
                    {customer.topMaterialStore.orderCount === 1 ? '' : 's'} ·{' '}
                    {formatCurrency(customer.topMaterialStore.totalSpent)} materials spend
                  </p>
                </div>
              ) : (
                <p className="mb-4 text-sm text-muted-foreground">No paid material orders yet.</p>
              )}
              {customer.materialStores.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="table-header px-4 py-2 text-left">Supplier</th>
                        <th className="table-header px-4 py-2 text-left">Branch</th>
                        <th className="table-header px-4 py-2 text-left">City</th>
                        <th className="table-header px-4 py-2 text-left">Orders</th>
                        <th className="table-header px-4 py-2 text-left">Spent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customer.materialStores.map((store) => (
                        <tr key={store.branchId}>
                          <td className="px-4 py-3">{store.supplierName}</td>
                          <td className="px-4 py-3">{store.branchName}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {store.branchCity || '—'}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{store.orderCount}</td>
                          <td className="px-4 py-3 font-medium">
                            {formatCurrency(store.totalSpent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            {customer.servicesRequested.length > 0 && (
              <div className="card-elevated p-6">
                <h3 className="mb-2 font-semibold">Services requested</h3>
                <p className="text-sm text-muted-foreground">
                  {customer.servicesRequested.join(' · ')}
                </p>
              </div>
            )}

            <div className="card-elevated overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-6">
                <h3 className="font-semibold">Jobs</h3>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </div>
              {customer.jobs.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No jobs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="table-header px-6 py-3 text-left">Job</th>
                        <th className="table-header px-6 py-3 text-left">Provider</th>
                        <th className="table-header px-6 py-3 text-left">Category</th>
                        <th className="table-header px-6 py-3 text-left">Status</th>
                        <th className="table-header px-6 py-3 text-left">Paid</th>
                        <th className="table-header px-6 py-3 text-left">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customer.jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-muted/50">
                          <td
                            className="cursor-pointer px-6 py-4"
                            onClick={() => navigate(`/admin/jobs/${job.id}`)}
                          >
                            <p className="text-sm font-medium">{job.title}</p>
                            {job.siteAddress ? (
                              <p className="text-xs text-muted-foreground">{job.siteAddress}</p>
                            ) : null}
                          </td>
                          <td className="px-6 py-4">
                            {job.provider ? (
                              <button
                                type="button"
                                className="text-left text-sm hover:underline"
                                onClick={() => navigate(`/admin/providers/${job.provider!.id}`)}
                              >
                                <span className="font-medium">{job.provider.name}</span>
                                {job.provider.businessName ? (
                                  <span className="block text-xs text-muted-foreground">
                                    {job.provider.businessName}
                                  </span>
                                ) : null}
                                <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary">
                                  View provider
                                  <ExternalLink className="h-3 w-3" />
                                </span>
                              </button>
                            ) : (
                              <span className="text-sm text-muted-foreground">Unassigned</span>
                            )}
                          </td>
                          <td
                            className="cursor-pointer px-6 py-4 text-sm"
                            onClick={() => navigate(`/admin/jobs/${job.id}`)}
                          >
                            {job.categoryName}
                          </td>
                          <td
                            className="cursor-pointer px-6 py-4"
                            onClick={() => navigate(`/admin/jobs/${job.id}`)}
                          >
                            <span
                              className={cn(
                                'status-badge',
                                getUserStatusBadgeClass(job.status),
                              )}
                            >
                              {getStandardizedStatusLabel(job.status)}
                            </span>
                          </td>
                          <td
                            className="cursor-pointer px-6 py-4 text-sm"
                            onClick={() => navigate(`/admin/jobs/${job.id}`)}
                          >
                            <div className="inline-flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1">
                                <DollarSign className="h-3 w-3 text-muted-foreground" />
                                {formatCurrency(job.totalPaid)}
                              </span>
                              {(job.refundAmount ?? 0) > 0 ? (
                                <span className="text-xs text-destructive tabular-nums">
                                  −{formatCurrency(job.refundAmount!)} refunded
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td
                            className="cursor-pointer px-6 py-4 text-sm text-muted-foreground"
                            onClick={() => navigate(`/admin/jobs/${job.id}`)}
                          >
                            {new Date(job.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block customer</DialogTitle>
            <DialogDescription>
              {customer?.name} will be restricted from new requests and material orders but can still sign in,
              view history, and contact support.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason (required)</Label>
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Explain why this customer is being blocked…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isMutating || !blockReason.trim()} onClick={() => void handleBlock()}>
              {isMutating ? 'Blocking…' : 'Block customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete customer</DialogTitle>
            <DialogDescription>
              This soft-deletes {customer?.name} and blocks their account. They disappear from the
              customer list but historical jobs and orders remain in the system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isMutating} onClick={() => void handleDelete()}>
              {isMutating ? 'Deleting…' : 'Delete customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
