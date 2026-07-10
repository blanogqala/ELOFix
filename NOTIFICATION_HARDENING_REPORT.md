# EloFix Notification System Hardening Report

## Fixes Applied

### Duplicate Prevention

- Split `payment_made` dedupe keys by payment kind (`labor`, `materials`, `delivery`) so separate payments on the same job no longer suppress one another.
- Emitted material payments as `material_paid`, matching the existing frontend type and material job activity section.
- Removed duplicate courier request notifications in delivery request flows by keeping the `job_request` notification where a courier job exists and preserving `courier_delivery_request` only as a fallback when there is no linked job.

### Job Lifecycle

- Added customer notification when an assigned provider rejects a job (`provider_rejected`).
- Added customer and provider notifications after successful non-dispute job cancellation (`job_cancelled`).
- Added customer refund notification when cancellation produces a refund (`refund_processed`).
- Added provider notification when an admin releases escrow manually (`payment_released`).
- Added customer notification when a provider cancellation opens dispute review.

### Materials, Reviews, Withdrawals, and Supplier Events

- Added notifications for customer and provider material suggestion creation, acceptance, and rejection.
- Added provider notification when a new review is created for a completed job, without notifying on review edits.
- Added provider withdrawal notifications for auto-paid provider withdrawals and admin status transitions.
- Added supplier owner and branch staff withdrawal notifications for branch withdrawals.
- Added supplier account-ready notification after admin supplier provisioning.

### Badge and Read Synchronization

- Added backend nav-read coverage for `/supplier/orders`, `/supplier/earnings`, `/provider/earnings`, and `/user/material-orders`.
- Added branch-staff support for `PATCH /notifications/nav/read`; branch staff no longer receive a 400 for supported supplier order clearance.
- Added frontend clearance mapping for supplier, branch staff, provider earnings, supplier earnings, and customer material-order routes.
- Consolidated notification socket listeners into `useNotificationSocketSync`, mounted once in `DashboardLayout`.
- Removed duplicate notification socket subscriptions from notification list, job indicators, admin indicators, and nav clearance hooks.
- Extended frontend notification types to include backend payloads for delivery, refund, repayment, withdrawal, supplier, fraud review, and review events.

## Event Matrix

| Event area | Final status |
|---|---|
| Service Requests | Covered; courier duplicate paths hardened |
| Job Acceptance | Existing behavior preserved |
| Job Rejection | Added customer notification |
| Job Cancellation | Added customer and provider notifications |
| Job Completion | Existing behavior preserved |
| Material Orders | Existing behavior preserved; supplier/customer page clearance added |
| Payment Received | Dedupe fixed by payment kind |
| Escrow Released | Manual admin release now notifies provider |
| Refunds | Cancellation refund now notifies customer |
| Provider Verification | Existing behavior preserved |
| Supplier Approval / Provisioning | Admin-created supplier receives account-ready notification |
| Reviews | Provider receives new-review notification |
| Messages | Existing per-message behavior preserved |
| Disputes | Provider-cancel dispute review now notifies customer |
| Withdrawals | Provider, supplier owner, and branch staff receive withdrawal updates |
| Delivery Updates | Existing delivery updates preserved; duplicate courier requests removed |

## Remaining Risks

- `job_chat` still creates one notification per message. This is intentional chat activity behavior.
- Opening `/user/notifications`, `/provider/notifications`, `/admin/notifications`, or `/supplier/notifications` still does not bulk-mark notifications read. Existing UX requires clicking a notification or using Mark All Read.
- Selecting a notification thread without clicking a message still leaves unread rows unread. This preserves current inbox behavior.
- Support messages still fan out to all admins without dedupe. This is intentionally left unchanged because it affects support workflow semantics.
- `provider_application_*` dedupe keys still include `Date.now()` so repeated submissions/rejections create separate rows.
- `material_list_replaced` remains an orphan notification type because no matching business flow exists.
- `provider_accepted` remains an unused frontend alias; backend continues using `job_accepted`.

## Validation

- Added hardening tests for payment-kind dedupe and supplier/material-order nav clearance contracts in `elofix-backend/tests/notifications.hardening.test.js`.
- Existing notification outbox and dedupe tests remain in place.
