import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSupplierBranchUsers,
  postSupplierBranchUser,
  patchSupplierBranchUser,
  deleteSupplierBranchUser,
  type SupplierBranchPortalUser,
} from '@/lib/api/supplierPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2 } from 'lucide-react';

export function BranchStaffSection({ branchId }: { branchId: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STAFF' | 'MANAGER'>('STAFF');

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierBranchPortalUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'STAFF' | 'MANAGER'>('STAFF');

  const [deleteTarget, setDeleteTarget] = useState<SupplierBranchPortalUser | null>(null);

  const { data: staff = [] } = useQuery({
    queryKey: ['supplier', 'branch-users', userId, branchId],
    queryFn: () => getSupplierBranchUsers(branchId),
    enabled: Boolean(userId && branchId),
  });

  useEffect(() => {
    if (!editing) return;
    setEditEmail(editing.email);
    setEditPassword('');
    setEditRole(editing.role === 'MANAGER' ? 'MANAGER' : 'STAFF');
  }, [editing]);

  const invalidateStaff = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'branch-users', userId, branchId] });
  };

  const addMut = useMutation({
    mutationFn: () => postSupplierBranchUser(branchId, { email: email.trim(), password, role }),
    onSuccess: () => {
      invalidateStaff();
      setEmail('');
      setPassword('');
      toast({ title: 'Branch staff created — they sign in with this email on the main login page.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const patchMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('No staff selected');
      const body: { email: string; role: 'STAFF' | 'MANAGER'; password?: string } = {
        email: editEmail.trim(),
        role: editRole,
      };
      if (editPassword.trim().length >= 8) {
        body.password = editPassword.trim();
      }
      return patchSupplierBranchUser(branchId, editing.id, body);
    },
    onSuccess: () => {
      invalidateStaff();
      setEditOpen(false);
      setEditing(null);
      setEditPassword('');
      toast({ title: 'Staff account updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (branchUserId: string) => deleteSupplierBranchUser(branchId, branchUserId),
    onSuccess: () => {
      invalidateStaff();
      setDeleteTarget(null);
      toast({ title: 'Staff account removed' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openEdit = (s: SupplierBranchPortalUser) => {
    setEditing(s);
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editEmail.trim()) {
      toast({ title: 'Email required', variant: 'destructive' });
      return;
    }
    if (editPassword.trim() && editPassword.trim().length < 8) {
      toast({ title: 'New password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    patchMut.mutate();
  };

  return (
    <div className="space-y-3 border-t border-border/80 pt-6 mt-6">
      <h3 className="text-sm font-medium">Branch staff logins</h3>
      <p className="text-xs text-muted-foreground">
        Staff use the normal login screen with the email and password you set here. They only see this branch&apos;s
        orders.
      </p>
      {staff.length > 0 && (
        <ul className="space-y-2">
          {staff.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground break-all">{s.email}</span>
                <span className="text-xs text-muted-foreground ml-2">({String(s.role).toLowerCase()})</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${s.email}`} onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={`Remove ${s.email}`}
                  onClick={() => setDeleteTarget(s)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`staff-email-${branchId}`}>Email</Label>
          <Input
            id={`staff-email-${branchId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`staff-pw-${branchId}`}>Password (min 8 chars)</Label>
          <Input
            id={`staff-pw-${branchId}`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label>Role</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
            value={role}
            onChange={(e) => setRole(e.target.value as 'STAFF' | 'MANAGER')}
          >
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={addMut.isPending || !email.trim() || password.length < 8}
          onClick={() => addMut.mutate()}
        >
          {addMut.isPending ? 'Adding…' : 'Add staff account'}
        </Button>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditing(null);
            setEditPassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit staff login</DialogTitle>
            <DialogDescription>Change email, role, or set a new password (optional).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`edit-staff-email-${branchId}`}>Email</Label>
              <Input
                id={`edit-staff-email-${branchId}`}
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-staff-pw-${branchId}`}>New password (optional)</Label>
              <Input
                id={`edit-staff-pw-${branchId}`}
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">Minimum 8 characters when changing password.</p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'STAFF' | 'MANAGER')}
              >
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={patchMut.isPending || !editEmail.trim()} onClick={saveEdit}>
              {patchMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this staff login?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.email} will no longer be able to sign in for this branch. This cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                deleteMut.mutate(deleteTarget.id);
              }}
            >
              {deleteMut.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
