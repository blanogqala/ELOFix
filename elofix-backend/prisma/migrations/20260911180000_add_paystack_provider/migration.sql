-- AlterEnum: add PAYSTACK as a first-class PaymentIntent / webhook / payout-profile provider.
-- Do not change PaymentIntent kinds, PaymentType, PaymentState, dispute, or refund enums.

ALTER TYPE "PaymentProvider" ADD VALUE 'PAYSTACK';
