import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

function namedPage<P = object>(
  factory: () => Promise<Record<string, ComponentType<P>>>,
  exportName: string,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => factory().then((module) => ({ default: module[exportName] })));
}

// Public pages
export const Landing = lazy(() => import('@/pages/Landing'));
export const Login = lazy(() => import('@/pages/auth/Login'));
export const Register = lazy(() => import('@/pages/auth/Register'));
export const GoogleCallback = lazy(() => import('@/pages/auth/GoogleCallback'));
export const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
export const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
export const AuthSuccess = lazy(() => import('@/pages/auth/AuthSuccess'));
export const NotFound = lazy(() => import('@/pages/NotFound'));
export const Unauthorized = lazy(() => import('@/pages/Unauthorized'));
export const TrackDelivery = lazy(() => import('@/pages/TrackDelivery'));
export const ContactPage = lazy(() => import('@/pages/Contact'));
export const LegalIndexPage = lazy(() => import('@/pages/legal/LegalIndex'));

export const TermsPage = namedPage(() => import('@/pages/legal/pages'), 'TermsPage');
export const PrivacyPage = namedPage(() => import('@/pages/legal/pages'), 'PrivacyPage');
export const ProviderAgreementPage = namedPage(() => import('@/pages/legal/pages'), 'ProviderAgreementPage');
export const RefundPolicyPage = namedPage(() => import('@/pages/legal/pages'), 'RefundPolicyPage');
export const JobCompletionVerificationPage = namedPage(
  () => import('@/pages/legal/pages'),
  'JobCompletionVerificationPage',
);
export const EscrowPolicyPage = namedPage(() => import('@/pages/legal/pages'), 'EscrowPolicyPage');
export const DisputeResolutionPage = namedPage(() => import('@/pages/legal/pages'), 'DisputeResolutionPage');
export const AdminInvestigationPage = namedPage(() => import('@/pages/legal/pages'), 'AdminInvestigationPage');
export const CorrectiveWorkPage = namedPage(() => import('@/pages/legal/pages'), 'CorrectiveWorkPage');
export const PortfolioContentRightsPage = namedPage(
  () => import('@/pages/legal/pages'),
  'PortfolioContentRightsPage',
);
export const ProviderVerificationPage = namedPage(
  () => import('@/pages/legal/pages'),
  'ProviderVerificationPage',
);
export const FraudPreventionPage = namedPage(() => import('@/pages/legal/pages'), 'FraudPreventionPage');
export const DeviceSecurityPage = namedPage(() => import('@/pages/legal/pages'), 'DeviceSecurityPage');
export const ProviderReputationPage = namedPage(() => import('@/pages/legal/pages'), 'ProviderReputationPage');
export const SupplierAgreementPage = namedPage(() => import('@/pages/legal/pages'), 'SupplierAgreementPage');
export const SupplierParticipationPage = namedPage(
  () => import('@/pages/legal/pages'),
  'SupplierParticipationPage',
);
export const DataProcessingPage = namedPage(() => import('@/pages/legal/pages'), 'DataProcessingPage');
export const CommunityStandardsPage = namedPage(() => import('@/pages/legal/pages'), 'CommunityStandardsPage');
export const CookiePolicyPage = namedPage(() => import('@/pages/legal/pages'), 'CookiePolicyPage');
export const PlatformActivityRecordsPage = namedPage(
  () => import('@/pages/legal/pages'),
  'PlatformActivityRecordsPage',
);
export const DeliveryPolicyPage = namedPage(() => import('@/pages/legal/pages'), 'DeliveryPolicyPage');

// User pages
export const UserDashboard = lazy(() => import('@/pages/user/Dashboard'));
export const NewRequest = lazy(() => import('@/pages/user/NewRequest'));
export const ServiceRequest = lazy(() => import('@/pages/user/ServiceRequest'));
export const UserProviderProfile = lazy(() => import('@/pages/user/ProviderProfile'));
export const UserJobs = lazy(() => import('@/pages/user/Jobs'));
export const JobDetail = lazy(() => import('@/pages/user/JobDetail'));
export const UserDisputeDetail = lazy(() => import('@/pages/user/DisputeDetail'));
export const UserCancellationDetail = lazy(() => import('@/pages/user/CancellationDetail'));
export const UserProfile = lazy(() => import('@/pages/user/Profile'));
export const UserPayments = lazy(() => import('@/pages/user/Payments'));
export const UserNotifications = lazy(() => import('@/pages/user/Notifications'));
export const OrderMaterials = lazy(() => import('@/pages/user/OrderMaterials'));
export const MaterialOrders = lazy(() => import('@/pages/user/MaterialOrders'));
export const OrderDetails = lazy(() => import('@/pages/user/OrderDetails'));
export const PaymentReturn = lazy(() => import('@/pages/payments/PaymentReturn'));
export const PaymentCancel = lazy(() => import('@/pages/payments/PaymentCancel'));
export const UserJobSuggestMaterials = lazy(() => import('@/pages/user/UserJobSuggestMaterials'));
export const DeliveryRequestDetailPage = lazy(() => import('@/pages/user/DeliveryRequestDetail'));

// Provider pages
export const ProviderDashboard = lazy(() => import('@/pages/provider/Dashboard'));
export const ProviderRequests = lazy(() => import('@/pages/provider/Requests'));
export const ProviderRequestDetail = lazy(() => import('@/pages/provider/RequestDetail'));
export const ProviderActiveJobs = lazy(() => import('@/pages/provider/ActiveJobs'));
export const ProviderJobDetail = lazy(() => import('@/pages/provider/JobDetail'));
export const ProviderDisputeDetail = lazy(() => import('@/pages/provider/DisputeDetail'));
export const ProviderCancellationDetail = lazy(() => import('@/pages/provider/CancellationDetail'));
export const ProviderJobBrowseMaterials = lazy(() => import('@/pages/provider/ProviderJobBrowseMaterials'));
export const ProviderEarnings = lazy(() => import('@/pages/provider/Earnings'));
export const ProviderJobRefundRepayment = lazy(() => import('@/pages/provider/JobRefundRepayment'));
export const ProviderProfile = lazy(() => import('@/pages/provider/Profile'));
export const ProviderDocuments = lazy(() => import('@/pages/provider/Documents'));
export const ProviderTrustScoreDetails = lazy(() => import('@/pages/provider/TrustScoreDetails'));

// Admin pages
export const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
export const AdminProviders = lazy(() => import('@/pages/admin/Providers'));
export const AdminProviderDetail = lazy(() => import('@/pages/admin/ProviderDetail'));
export const AdminJobs = lazy(() => import('@/pages/admin/Jobs'));
export const AdminJobDetail = lazy(() => import('@/pages/admin/JobDetail'));
export const AdminPayments = lazy(() => import('@/pages/admin/Payments'));
export const AdminPaymentDetail = lazy(() => import('@/pages/admin/PaymentDetail'));
export const AdminSuppliers = lazy(() => import('@/pages/admin/Suppliers'));
export const AdminSupplierDetail = lazy(() => import('@/pages/admin/SupplierDetail'));
export const AdminSupplierCatalogPage = lazy(() => import('@/pages/admin/AdminSupplierCatalogPage'));
export const AdminSupplierBranchCatalogPage = lazy(() => import('@/pages/admin/AdminSupplierBranchCatalogPage'));
export const AdminCategories = lazy(() => import('@/pages/admin/Categories'));
export const AdminAnalytics = lazy(() => import('@/pages/admin/Analytics'));
export const FraudCenter = lazy(() => import('@/pages/admin/FraudCenter'));
export const FraudAlerts = lazy(() => import('@/pages/admin/FraudAlerts'));
export const FraudAlertDetail = lazy(() => import('@/pages/admin/FraudAlertDetail'));
export const FraudDeviceDetail = lazy(() => import('@/pages/admin/FraudDeviceDetail'));
export const AdminWithdrawals = lazy(() => import('@/pages/admin/Withdrawals'));
export const AdminRefundRepayments = lazy(() => import('@/pages/admin/RefundRepayments'));
export const AdminDisputeDetail = lazy(() => import('@/pages/admin/DisputeDetail'));
export const AdminCancellationDetail = lazy(() => import('@/pages/admin/CancellationDetail'));
export const AdminCustomers = lazy(() => import('@/pages/admin/Customers'));
export const AdminCustomerDetail = lazy(() => import('@/pages/admin/CustomerDetail'));

// Supplier portal
export const SupplierDashboard = lazy(() => import('@/pages/supplier/Dashboard'));
export const SupplierOrdersPage = lazy(() => import('@/pages/supplier/OrdersPage'));
export const SupplierInventoryPage = lazy(() => import('@/pages/supplier/InventoryPage'));
export const SupplierEarningsPage = lazy(() => import('@/pages/supplier/EarningsPage'));
export const SupplierBranchEarningsPage = lazy(() => import('@/pages/supplier/SupplierBranchEarningsPage'));
export const SupplierProfilePage = lazy(() => import('@/pages/supplier/ProfilePage'));
export const SupplierBranchesPage = lazy(() => import('@/pages/supplier/BranchesPage'));
export const BranchDetailPage = lazy(() => import('@/pages/supplier/BranchDetailPage'));
export const BranchStaffProfilePage = lazy(() => import('@/pages/supplier/BranchStaffProfilePage'));
