import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/guards/AuthGuard";

// Public pages
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";

// User pages
import UserDashboard from "./pages/user/Dashboard";
import NewRequest from "./pages/user/NewRequest";
import ServiceRequest from "./pages/user/ServiceRequest";
import UserJobs from "./pages/user/Jobs";
import JobDetail from "./pages/user/JobDetail";
import UserProfile from "./pages/user/Profile";
import UserPayments from "./pages/user/Payments";
import UserNotifications from "./pages/user/Notifications";
import OrderMaterials from "./pages/user/OrderMaterials";
import MaterialOrders from "./pages/user/MaterialOrders";
import OrderDetails from "./pages/user/OrderDetails";

// Provider pages
import ProviderDashboard from "./pages/provider/Dashboard";
import ProviderRequests from "./pages/provider/Requests";
import ProviderRequestDetail from "./pages/provider/RequestDetail";
import ProviderActiveJobs from "./pages/provider/ActiveJobs";
import ProviderJobDetail from "./pages/provider/JobDetail";
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
import AdminCategories from "./pages/admin/Categories.tsx";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminWithdrawals from "./pages/admin/Withdrawals";

// Supplier portal
import SupplierDashboard from "./pages/supplier/Dashboard";
import SupplierOrdersPage from "./pages/supplier/OrdersPage";
import SupplierInventoryPage from "./pages/supplier/InventoryPage";
import SupplierEarningsPage from "./pages/supplier/EarningsPage";
import SupplierProfilePage from "./pages/supplier/ProfilePage";

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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* User Routes */}
            <Route path="/user/dashboard" element={<AuthGuard allowedRoles={['user']}><UserDashboard /></AuthGuard>} />
            <Route path="/user/new-request" element={<AuthGuard allowedRoles={['user']}><NewRequest /></AuthGuard>} />
            <Route path="/user/request" element={<AuthGuard allowedRoles={['user']}><NewRequest /></AuthGuard>} />
            <Route path="/user/request/service" element={<AuthGuard allowedRoles={['user']}><ServiceRequest /></AuthGuard>} />
            <Route path="/user/jobs" element={<AuthGuard allowedRoles={['user']}><UserJobs /></AuthGuard>} />
            <Route path="/user/jobs/:id" element={<AuthGuard allowedRoles={['user']}><JobDetail /></AuthGuard>} />
            <Route path="/user/payments" element={<AuthGuard allowedRoles={['user']}><UserPayments /></AuthGuard>} />
            <Route path="/user/profile" element={<AuthGuard allowedRoles={['user']}><UserProfile /></AuthGuard>} />
            <Route path="/user/notifications" element={<AuthGuard allowedRoles={['user']}><UserNotifications /></AuthGuard>} />
            <Route path="/provider/notifications" element={<AuthGuard allowedRoles={['provider']}><UserNotifications /></AuthGuard>} />
            <Route path="/admin/notifications" element={<AuthGuard allowedRoles={['admin']}><UserNotifications /></AuthGuard>} />
            <Route path="/supplier/notifications" element={<AuthGuard allowedRoles={['supplier']}><UserNotifications /></AuthGuard>} />
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
            <Route path="/provider/jobs/:id" element={<AuthGuard allowedRoles={['provider']}><ProviderJobDetail /></AuthGuard>} />
            <Route path="/provider/earnings" element={<AuthGuard allowedRoles={['provider']}><ProviderEarnings /></AuthGuard>} />
            <Route path="/provider/profile" element={<AuthGuard allowedRoles={['provider']}><ProviderProfile /></AuthGuard>} />
            <Route path="/provider/documents" element={<AuthGuard allowedRoles={['provider']}><ProviderDocuments /></AuthGuard>} />

            {/* Supplier Routes */}
            <Route path="/supplier/dashboard" element={<AuthGuard allowedRoles={['supplier']}><SupplierDashboard /></AuthGuard>} />
            <Route path="/supplier/orders" element={<AuthGuard allowedRoles={['supplier']}><SupplierOrdersPage /></AuthGuard>} />
            <Route path="/supplier/inventory" element={<AuthGuard allowedRoles={['supplier']}><SupplierInventoryPage /></AuthGuard>} />
            <Route path="/supplier/earnings" element={<AuthGuard allowedRoles={['supplier']}><SupplierEarningsPage /></AuthGuard>} />
            <Route path="/supplier/profile" element={<AuthGuard allowedRoles={['supplier']}><SupplierProfilePage /></AuthGuard>} />

            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={<AuthGuard allowedRoles={['admin']}><AdminDashboard /></AuthGuard>} />
            <Route path="/admin/analytics" element={<AuthGuard allowedRoles={['admin']}><AdminAnalytics /></AuthGuard>} />
            <Route path="/admin/providers" element={<AuthGuard allowedRoles={['admin']}><AdminProviders /></AuthGuard>} />
            <Route path="/admin/providers/:id" element={<AuthGuard allowedRoles={['admin']}><AdminProviderDetail /></AuthGuard>} />
            <Route path="/admin/suppliers" element={<AuthGuard allowedRoles={['admin']}><AdminSuppliers /></AuthGuard>} />
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
