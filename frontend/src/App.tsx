import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/guards/AuthGuard";
import { GoogleMapsProvider } from "@/components/map/GoogleMapsProvider";

// Public pages
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import GoogleCallback from "./pages/auth/GoogleCallback";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";
import TrackDelivery from "./pages/TrackDelivery";
import TermsPage from "./pages/legal/Terms";
import PrivacyPage from "./pages/legal/Privacy";
import ProviderAgreementPage from "./pages/legal/ProviderAgreement";
import RefundPolicyPage from "./pages/legal/RefundPolicy";

// User pages
import UserDashboard from "./pages/user/Dashboard";
import NewRequest from "./pages/user/NewRequest";
import ServiceRequest from "./pages/user/ServiceRequest";
import UserProviderProfile from "./pages/user/ProviderProfile";
import UserJobs from "./pages/user/Jobs";
import JobDetail from "./pages/user/JobDetail";
import UserProfile from "./pages/user/Profile";
import UserPayments from "./pages/user/Payments";
import UserNotifications from "./pages/user/Notifications";
import OrderMaterials from "./pages/user/OrderMaterials";
import MaterialOrders from "./pages/user/MaterialOrders";
import OrderDetails from "./pages/user/OrderDetails";
import PaymentReturn from "./pages/payments/PaymentReturn";
import PaymentCancel from "./pages/payments/PaymentCancel";
import UserJobSuggestMaterials from "./pages/user/UserJobSuggestMaterials";
import DeliveryRequestDetailPage from "./pages/user/DeliveryRequestDetail";

// Provider pages
import ProviderDashboard from "./pages/provider/Dashboard";
import ProviderRequests from "./pages/provider/Requests";
import ProviderRequestDetail from "./pages/provider/RequestDetail";
import ProviderActiveJobs from "./pages/provider/ActiveJobs";
import ProviderJobDetail from "./pages/provider/JobDetail";
import ProviderJobBrowseMaterials from "./pages/provider/ProviderJobBrowseMaterials";
import ProviderEarnings from "./pages/provider/Earnings";
import ProviderProfile from "./pages/provider/Profile";
import ProviderDocuments from "./pages/provider/Documents";
// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminProviders from "./pages/admin/Providers";
import AdminProviderDetail from "./pages/admin/ProviderDetail";
import AdminJobs from "./pages/admin/Jobs";
import AdminJobDetail from "./pages/admin/JobDetail";
import AdminPayments from "./pages/admin/Payments";
import AdminPaymentDetail from "./pages/admin/PaymentDetail";
import AdminSuppliers from "./pages/admin/Suppliers";
import AdminSupplierDetail from "./pages/admin/SupplierDetail";
import AdminSupplierCatalogPage from "./pages/admin/AdminSupplierCatalogPage";
import AdminSupplierBranchCatalogPage from "./pages/admin/AdminSupplierBranchCatalogPage";
import AdminCategories from "./pages/admin/Categories.tsx";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminWithdrawals from "./pages/admin/Withdrawals";
import AdminCustomers from "./pages/admin/Customers";
import AdminCustomerDetail from "./pages/admin/CustomerDetail";

// Supplier portal
import SupplierDashboard from "./pages/supplier/Dashboard";
import SupplierOrdersPage from "./pages/supplier/OrdersPage";
import SupplierInventoryPage from "./pages/supplier/InventoryPage";
import SupplierEarningsPage from "./pages/supplier/EarningsPage";
import SupplierBranchEarningsPage from "./pages/supplier/SupplierBranchEarningsPage";
import SupplierProfilePage from "./pages/supplier/ProfilePage";
import SupplierBranchesPage from "./pages/supplier/BranchesPage";
import BranchDetailPage from "./pages/supplier/BranchDetailPage";
import BranchStaffProfilePage from "./pages/supplier/BranchStaffProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GoogleMapsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/track/:trackingId" element={<TrackDelivery />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/provider-agreement" element={<ProviderAgreementPage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />

            {/* User Routes */}
            <Route path="/user/dashboard" element={<AuthGuard allowedRoles={['user']}><UserDashboard /></AuthGuard>} />
            <Route path="/user/new-request" element={<AuthGuard allowedRoles={['user']}><NewRequest /></AuthGuard>} />
            <Route path="/user/request" element={<AuthGuard allowedRoles={['user']}><NewRequest /></AuthGuard>} />
            <Route path="/user/request/service" element={<AuthGuard allowedRoles={['user']}><ServiceRequest /></AuthGuard>} />
            <Route path="/user/providers/:id" element={<AuthGuard allowedRoles={['user']}><UserProviderProfile /></AuthGuard>} />
            <Route path="/user/jobs" element={<AuthGuard allowedRoles={['user']}><UserJobs /></AuthGuard>} />
            <Route path="/user/jobs/:id/suggest-materials" element={<AuthGuard allowedRoles={['user']}><UserJobSuggestMaterials /></AuthGuard>} />
            <Route path="/user/jobs/:id" element={<AuthGuard allowedRoles={['user']}><JobDetail /></AuthGuard>} />
            <Route path="/user/payments" element={<AuthGuard allowedRoles={['user']}><UserPayments /></AuthGuard>} />
            <Route path="/payments/return" element={<AuthGuard allowedRoles={['user']}><PaymentReturn /></AuthGuard>} />
            <Route path="/payments/cancel" element={<AuthGuard allowedRoles={['user']}><PaymentCancel /></AuthGuard>} />
            <Route path="/user/profile" element={<AuthGuard allowedRoles={['user']}><UserProfile /></AuthGuard>} />
            <Route path="/user/notifications" element={<AuthGuard allowedRoles={['user']}><UserNotifications /></AuthGuard>} />
            <Route path="/provider/notifications" element={<AuthGuard allowedRoles={['provider']}><UserNotifications /></AuthGuard>} />
            <Route path="/admin/notifications" element={<AuthGuard allowedRoles={['admin']}><UserNotifications /></AuthGuard>} />
            <Route path="/supplier/notifications" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><UserNotifications /></AuthGuard>} />
            <Route
              path="/user/request/delivery"
              element={
                <AuthGuard allowedRoles={['user']}>
                  <Navigate to="/user/request/service?category=delivery" replace />
                </AuthGuard>
              }
            />
            <Route path="/user/delivery-requests/:id" element={<AuthGuard allowedRoles={['user']}><DeliveryRequestDetailPage /></AuthGuard>} />
            <Route path="/user/order-materials" element={<AuthGuard allowedRoles={['user']}><OrderMaterials /></AuthGuard>} />
            <Route path="/user/material-orders" element={<AuthGuard allowedRoles={['user']}><MaterialOrders /></AuthGuard>} />
            <Route path="/user/material-orders/:orderId" element={<AuthGuard allowedRoles={['user']}><OrderDetails /></AuthGuard>} />
            <Route path="/user/jobs/:jobId/store-orders/:storeOrderId" element={<AuthGuard allowedRoles={['user']}><OrderDetails /></AuthGuard>} />
            <Route path="/user/orders/:orderId" element={<AuthGuard allowedRoles={['user']}><OrderDetails /></AuthGuard>} />

            {/* Provider Routes */}
            <Route path="/provider/dashboard" element={<AuthGuard allowedRoles={['provider']}><ProviderDashboard /></AuthGuard>} />
            <Route path="/provider/requests" element={<AuthGuard allowedRoles={['provider']}><ProviderRequests /></AuthGuard>} />
            <Route path="/provider/requests/:id" element={<AuthGuard allowedRoles={['provider']}><ProviderRequestDetail /></AuthGuard>} />
            <Route path="/provider/jobs" element={<AuthGuard allowedRoles={['provider']}><ProviderActiveJobs /></AuthGuard>} />
            <Route path="/provider/jobs/:id/materials/browse" element={<AuthGuard allowedRoles={['provider']}><ProviderJobBrowseMaterials /></AuthGuard>} />
            <Route path="/provider/jobs/:id" element={<AuthGuard allowedRoles={['provider']}><ProviderJobDetail /></AuthGuard>} />
            <Route path="/provider/earnings" element={<AuthGuard allowedRoles={['provider']}><ProviderEarnings /></AuthGuard>} />
            <Route path="/provider/profile" element={<AuthGuard allowedRoles={['provider']}><ProviderProfile /></AuthGuard>} />
            <Route path="/provider/documents" element={<AuthGuard allowedRoles={['provider']}><ProviderDocuments /></AuthGuard>} />
            <Route
              path="/provider/deliveries"
              element={<Navigate to="/provider/requests" replace />}
            />
            <Route
              path="/provider/deliveries/:orderId"
              element={<Navigate to="/provider/requests" replace />}
            />
            <Route
              path="/provider/direct-deliveries/:id"
              element={<Navigate to="/provider/requests" replace />}
            />

            {/* Supplier Routes */}
            <Route path="/supplier/dashboard" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><SupplierDashboard /></AuthGuard>} />
            <Route path="/supplier/orders" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><SupplierOrdersPage /></AuthGuard>} />
            <Route path="/supplier/branches" element={<AuthGuard allowedRoles={['supplier']}><SupplierBranchesPage /></AuthGuard>} />
            <Route path="/supplier/branches/:branchId" element={<AuthGuard allowedRoles={['supplier']}><BranchDetailPage /></AuthGuard>} />
            <Route path="/supplier/inventory" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><SupplierInventoryPage /></AuthGuard>} />
            <Route path="/supplier/earnings" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><SupplierEarningsPage /></AuthGuard>} />
            <Route path="/supplier/earnings/branch/:branchId" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><SupplierBranchEarningsPage /></AuthGuard>} />
            <Route path="/supplier/profile" element={<AuthGuard allowedRoles={['supplier']}><SupplierProfilePage /></AuthGuard>} />
            <Route path="/supplier/branch-profile" element={<AuthGuard allowedRoles={['branch_staff']}><BranchStaffProfilePage /></AuthGuard>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AuthGuard allowedRoles={['admin']}><AdminDashboard /></AuthGuard>} />
            <Route path="/admin/analytics" element={<AuthGuard allowedRoles={['admin']}><AdminAnalytics /></AuthGuard>} />
            <Route path="/admin/customers" element={<AuthGuard allowedRoles={['admin']}><AdminCustomers /></AuthGuard>} />
            <Route path="/admin/customers/:id" element={<AuthGuard allowedRoles={['admin']}><AdminCustomerDetail /></AuthGuard>} />
            <Route path="/admin/providers" element={<AuthGuard allowedRoles={['admin']}><AdminProviders /></AuthGuard>} />
            <Route path="/admin/providers/:id" element={<AuthGuard allowedRoles={['admin']}><AdminProviderDetail /></AuthGuard>} />
            <Route path="/admin/suppliers" element={<AuthGuard allowedRoles={['admin']}><AdminSuppliers /></AuthGuard>} />
            <Route
              path="/admin/suppliers/:supplierId/catalog"
              element={<AuthGuard allowedRoles={['admin']}><AdminSupplierCatalogPage /></AuthGuard>}
            />
            <Route
              path="/admin/suppliers/:supplierId/branches/:branchId/catalog"
              element={<AuthGuard allowedRoles={['admin']}><AdminSupplierBranchCatalogPage /></AuthGuard>}
            />
            <Route path="/admin/suppliers/:supplierId" element={<AuthGuard allowedRoles={['admin']}><AdminSupplierDetail /></AuthGuard>} />
            <Route path="/admin/categories" element={<AuthGuard allowedRoles={['admin']}><AdminCategories /></AuthGuard>} />
            <Route path="/admin/jobs" element={<AuthGuard allowedRoles={['admin']}><AdminJobs /></AuthGuard>} />
            <Route path="/admin/jobs/:id" element={<AuthGuard allowedRoles={['admin']}><AdminJobDetail /></AuthGuard>} />
            <Route path="/admin/payments" element={<AuthGuard allowedRoles={['admin']}><AdminPayments /></AuthGuard>} />
            <Route path="/admin/payments/:jobId" element={<AuthGuard allowedRoles={['admin']}><AdminPaymentDetail /></AuthGuard>} />
            <Route path="/admin/withdrawals" element={<AuthGuard allowedRoles={['admin']}><AdminWithdrawals /></AuthGuard>} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
