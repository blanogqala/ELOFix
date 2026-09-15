import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications } from '@/lib/api/notifications';
import {
  hasEarningsNavActivity,
  hasOrdersNavActivity,
} from '@/lib/supplierActivityIndicators';

export function useSupplierActivityIndicators() {
  const { user } = useAuth();
  const isSupplierNav =
    Boolean(user?.id) && (user?.role === 'supplier' || user?.role === 'branch_staff');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list', user?.id],
    queryFn: () => getNotifications(),
    enabled: isSupplierNav,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  return {
    notifications,
    isLoading,
    hasOrdersNavActivity: hasOrdersNavActivity(notifications),
    hasEarningsNavActivity: hasEarningsNavActivity(notifications),
  };
}
