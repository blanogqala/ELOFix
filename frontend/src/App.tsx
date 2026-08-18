import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/guards/AuthGuard";
import { LoadingProvider } from "@/components/common/loading";
import { OverlayLockGuard } from "@/components/common/OverlayLockGuard";
import { ScrollToTop } from "@/components/common/ScrollToTop";
import { RouteSuspense } from "@/components/routing/RouteSuspense";
import * as Pages from "@/routes/lazyPages";

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
    <LoadingProvider>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <OverlayLockGuard />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<RouteSuspense><Pages.Landing /></RouteSuspense>} />
            <Route path="/login" element={<RouteSuspense><Pages.Login /></RouteSuspense>} />
            <Route path="/register" element={<RouteSuspense><Pages.Register /></RouteSuspense>} />
            <Route path="/auth/google/callback" element={<RouteSuspense><Pages.GoogleCallback /></RouteSuspense>} />
            <Route path="/forgot-password" element={<RouteSuspense><Pages.ForgotPassword /></RouteSuspense>} />
            <Route path="/reset-password" element={<RouteSuspense><Pages.ResetPassword /></RouteSuspense>} />
            <Route path="/auth/success" element={<RouteSuspense><Pages.AuthSuccess /></RouteSuspense>} />
            <Route path="/unauthorized" element={<RouteSuspense><Pages.Unauthorized /></RouteSuspense>} />
            <Route path="/track/:trackingId" element={<RouteSuspense><Pages.TrackDelivery /></RouteSuspense>} />
            <Route path="/contact" element={<RouteSuspense><Pages.ContactPage /></RouteSuspense>} />
            <Route path="/legal" element={<RouteSuspense><Pages.LegalIndexPage /></RouteSuspense>} />
            <Route path="/terms" element={<RouteSuspense><Pages.TermsPage /></RouteSuspense>} />
            <Route path="/privacy" element={<RouteSuspense><Pages.PrivacyPage /></RouteSuspense>} />
            <Route path="/provider-agreement" element={<RouteSuspense><Pages.ProviderAgreementPage /></RouteSuspense>} />
            <Route path="/refund-policy" element={<RouteSuspense><Pages.RefundPolicyPage /></RouteSuspense>} />
            <Route path="/returns-policy" element={<RouteSuspense><Pages.RefundPolicyPage /></RouteSuspense>} />
            <Route path="/delivery-policy" element={<RouteSuspense><Pages.DeliveryPolicyPage /></RouteSuspense>} />
            <Route path="/job-completion-verification" element={<RouteSuspense><Pages.JobCompletionVerificationPage /></RouteSuspense>} />
            <Route path="/escrow-policy" element={<RouteSuspense><Pages.EscrowPolicyPage /></RouteSuspense>} />
            <Route path="/dispute-resolution" element={<RouteSuspense><Pages.DisputeResolutionPage /></RouteSuspense>} />
            <Route path="/admin-investigation" element={<RouteSuspense><Pages.AdminInvestigationPage /></RouteSuspense>} />
            <Route path="/corrective-work" element={<RouteSuspense><Pages.CorrectiveWorkPage /></RouteSuspense>} />
            <Route path="/portfolio-content-rights" element={<RouteSuspense><Pages.PortfolioContentRightsPage /></RouteSuspense>} />
            <Route path="/provider-verification" element={<RouteSuspense><Pages.ProviderVerificationPage /></RouteSuspense>} />
            <Route path="/fraud-prevention" element={<RouteSuspense><Pages.FraudPreventionPage /></RouteSuspense>} />
            <Route path="/device-security" element={<RouteSuspense><Pages.DeviceSecurityPage /></RouteSuspense>} />
            <Route path="/provider-reputation" element={<RouteSuspense><Pages.ProviderReputationPage /></RouteSuspense>} />
            <Route path="/supplier-agreement" element={<RouteSuspense><Pages.SupplierAgreementPage /></RouteSuspense>} />
            <Route path="/supplier-participation" element={<RouteSuspense><Pages.SupplierParticipationPage /></RouteSuspense>} />
            <Route path="/data-processing" element={<RouteSuspense><Pages.DataProcessingPage /></RouteSuspense>} />
            <Route path="/community-standards" element={<RouteSuspense><Pages.CommunityStandardsPage /></RouteSuspense>} />
            <Route path="/cookie-policy" element={<RouteSuspense><Pages.CookiePolicyPage /></RouteSuspense>} />
            <Route path="/platform-activity-records" element={<RouteSuspense><Pages.PlatformActivityRecordsPage /></RouteSuspense>} />

            {/* User Routes */}
            <Route path="/user/dashboard" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserDashboard /></RouteSuspense></AuthGuard>} />
            <Route path="/user/new-request" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.NewRequest /></RouteSuspense></AuthGuard>} />
            <Route path="/user/request" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.NewRequest /></RouteSuspense></AuthGuard>} />
            <Route path="/user/request/service" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.ServiceRequest /></RouteSuspense></AuthGuard>} />
            <Route path="/user/providers/:id" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserProviderProfile /></RouteSuspense></AuthGuard>} />
            <Route path="/user/jobs" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserJobs /></RouteSuspense></AuthGuard>} />
            <Route path="/user/jobs/:id/suggest-materials" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserJobSuggestMaterials /></RouteSuspense></AuthGuard>} />
            <Route path="/user/jobs/:id" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.JobDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/user/payments" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserPayments /></RouteSuspense></AuthGuard>} />
            <Route path="/payments/return" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.PaymentReturn /></RouteSuspense></AuthGuard>} />
            <Route path="/payments/cancel" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.PaymentCancel /></RouteSuspense></AuthGuard>} />
            <Route path="/user/disputes" element={<Navigate to="/user/jobs?view=review" replace />} />
            <Route path="/user/disputes/:id" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserDisputeDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/user/cancellations/:id" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserCancellationDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/user/profile" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserProfile /></RouteSuspense></AuthGuard>} />
            <Route path="/user/notifications" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.UserNotifications /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/notifications" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.UserNotifications /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/notifications" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.UserNotifications /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/notifications" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><RouteSuspense><Pages.UserNotifications /></RouteSuspense></AuthGuard>} />
            <Route
              path="/user/request/delivery"
              element={
                <AuthGuard allowedRoles={['user']}>
                  <Navigate to="/user/request/service?category=delivery" replace />
                </AuthGuard>
              }
            />
            <Route path="/user/delivery-requests/:id" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.DeliveryRequestDetailPage /></RouteSuspense></AuthGuard>} />
            <Route path="/user/order-materials" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.OrderMaterials /></RouteSuspense></AuthGuard>} />
            <Route path="/user/material-orders" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.MaterialOrders /></RouteSuspense></AuthGuard>} />
            <Route path="/user/material-orders/:orderId" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.OrderDetails /></RouteSuspense></AuthGuard>} />
            <Route path="/user/jobs/:jobId/store-orders/:storeOrderId" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.OrderDetails /></RouteSuspense></AuthGuard>} />
            <Route path="/user/orders/:orderId" element={<AuthGuard allowedRoles={['user']}><RouteSuspense><Pages.OrderDetails /></RouteSuspense></AuthGuard>} />

            {/* Provider Routes */}
            <Route path="/provider/dashboard" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderDashboard /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/trust-score" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderTrustScoreDetails /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/requests" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderRequests /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/requests/:id" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderRequestDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/jobs" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderActiveJobs /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/jobs/:id/materials/browse" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderJobBrowseMaterials /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/jobs/:id/refund" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderJobRefundRepayment /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/jobs/:id" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderJobDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/earnings" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderEarnings /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/disputes" element={<Navigate to="/provider/jobs?view=review" replace />} />
            <Route path="/provider/disputes/:id" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderDisputeDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/cancellations/:id" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderCancellationDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/profile" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderProfile /></RouteSuspense></AuthGuard>} />
            <Route path="/provider/documents" element={<AuthGuard allowedRoles={['provider']}><RouteSuspense><Pages.ProviderDocuments /></RouteSuspense></AuthGuard>} />
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
            <Route path="/supplier/dashboard" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><RouteSuspense><Pages.SupplierDashboard /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/orders" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><RouteSuspense><Pages.SupplierOrdersPage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/branches" element={<AuthGuard allowedRoles={['supplier']}><RouteSuspense><Pages.SupplierBranchesPage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/branches/:branchId" element={<AuthGuard allowedRoles={['supplier']}><RouteSuspense><Pages.BranchDetailPage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/inventory" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><RouteSuspense><Pages.SupplierInventoryPage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/earnings" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><RouteSuspense><Pages.SupplierEarningsPage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/earnings/branch/:branchId" element={<AuthGuard allowedRoles={['supplier', 'branch_staff']}><RouteSuspense><Pages.SupplierBranchEarningsPage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/profile" element={<AuthGuard allowedRoles={['supplier']}><RouteSuspense><Pages.SupplierProfilePage /></RouteSuspense></AuthGuard>} />
            <Route path="/supplier/branch-profile" element={<AuthGuard allowedRoles={['branch_staff']}><RouteSuspense><Pages.BranchStaffProfilePage /></RouteSuspense></AuthGuard>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminDashboard /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/analytics" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminAnalytics /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/fraud-center" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.FraudCenter /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/fraud-center/alerts" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.FraudAlerts /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/fraud-center/alerts/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.FraudAlertDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/fraud-center/devices/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.FraudDeviceDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/customers" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminCustomers /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/customers/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminCustomerDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/providers" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminProviders /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/providers/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminProviderDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/suppliers" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminSuppliers /></RouteSuspense></AuthGuard>} />
            <Route
              path="/admin/suppliers/:supplierId/catalog"
              element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminSupplierCatalogPage /></RouteSuspense></AuthGuard>}
            />
            <Route
              path="/admin/suppliers/:supplierId/branches/:branchId/catalog"
              element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminSupplierBranchCatalogPage /></RouteSuspense></AuthGuard>}
            />
            <Route path="/admin/suppliers/:supplierId" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminSupplierDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/categories" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminCategories /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/jobs" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminJobs /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/jobs/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminJobDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/payments" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminPayments /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/payments/:jobId" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminPaymentDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/withdrawals" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminWithdrawals /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/refund-repayments" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminRefundRepayments /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/disputes" element={<Navigate to="/admin/jobs?view=dispatched" replace />} />
            <Route path="/admin/disputes/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminDisputeDetail /></RouteSuspense></AuthGuard>} />
            <Route path="/admin/cancellations/:id" element={<AuthGuard allowedRoles={['admin']}><RouteSuspense><Pages.AdminCancellationDetail /></RouteSuspense></AuthGuard>} />

            {/* Catch-all */}
            <Route path="*" element={<RouteSuspense><Pages.NotFound /></RouteSuspense>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </LoadingProvider>
  </QueryClientProvider>
);

export default App;
