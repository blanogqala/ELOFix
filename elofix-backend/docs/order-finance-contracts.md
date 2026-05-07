# Order/Finance Contracts

This document locks request/response contracts used by frontend and backend for the order/finance enhancement work.

## Existing Contracts (must remain compatible)

- `GET /api/supplier/orders`
  - Query: optional `status`
  - Response: `{ success: true, orders: SupplierMaterialOrderLine[] }`
- `PATCH /api/supplier/orders/:orderId/fulfillment`
  - Body: `{ status: MaterialFulfillmentStatus }`
  - Response: `{ success: true, order: SupplierMaterialOrderLine }`
- `POST /api/supplier/orders/:orderId/notes`
  - Body: `{ message: string }`
  - Response: `{ success: true, order: SupplierMaterialOrderLine }`
- `GET /api/material-orders/:id`
  - Response: `{ success: true, order: MaterialOrder | null }`
- `PATCH /api/material-orders/:id/delivery`
  - Body: partial `OrderDelivery`
  - Response: `{ success: true, order: MaterialOrder | null }`
- `GET /api/orders`
  - Supplier/Admin listing
  - Response: `{ success: true, orders: SupplierMaterialOrderLine[] }`
- `PATCH /api/supplier/profile`
  - Body (current): business/profile/account fields
  - Response: `{ success: true, profile: SupplierAccountProfile }`

## New/Extended Contracts for This Feature

### 1) Supplier Cancel Material Order

- `POST /api/supplier/orders/:orderId/cancel`
  - Body:
    - `reason: string` (required)
  - Behavior:
    - status -> `CANCELLED`
    - `cancelledBy` -> `supplier`
    - full refund to customer
    - full 7% commission reversal
    - idempotent: repeat calls do not double-refund
  - Response:
    - `{ success: true, order, refund }`
    - `refund = { amount: number, status: string, processedAt?: string }`

### 2) Customer Cancel Material Order (conditional)

- `POST /api/material-orders/:id/cancel`
  - Body:
    - `reason?: string` (optional)
  - Allowed fulfillment statuses:
    - `ACCEPTED`
    - `PREPARING`
    - `READY`
  - Disallowed:
    - `OUT_FOR_DELIVERY`, terminal states
  - Behavior:
    - status -> `CANCELLED`
    - `cancelledBy` -> `customer`
    - refund = `total - 7% commission`
    - platform keeps 7%
    - idempotent against duplicate refunds
  - Response:
    - `{ success: true, order, refund }`
    - `refund = { amount: number, status: string, processedAt?: string }`

### 3) Supplier Orders Date Filter + Export Data

- `GET /api/supplier/orders`
  - Extended query:
    - `from?: string` (ISO date)
    - `to?: string` (ISO date)
  - Response shape unchanged.
- `GET /api/supplier/orders/export`
  - Query:
    - `from?: string`
    - `to?: string`
    - `format?: "json" | "excel" | "pdf"` (frontend will use `json` and generate files client-side)
  - Response:
    - `{ success: true, rows: SupplierEarningsExportRow[], summary }`
  - `SupplierEarningsExportRow` includes:
    - `orderId`, `status`, `totalAmount`, `commission`, `netEarnings`
    - `isCancelled`, `cancellationReason`, `cancelledBy`

### 4) Supplier Profile Delivery Settings

- `PATCH /api/supplier/profile`
  - Extended body:
    - `hasDelivery?: boolean`
    - `deliveryFee?: number`
    - existing fields remain supported
  - Response shape unchanged.

### 5) Address Fields in Order Detail

- Supplier order details payload should include customer/job-site address fields if available:
  - `customerAddress?: string`
  - `customerLocation?: { address?: string, city?: string, area?: string, suburb?: string, coordinates?: { lat: number, lng: number } }`

## Compatibility Rules

- Existing response keys must not be removed.
- Existing endpoint semantics for non-cancel paths must remain unchanged.
- New fields are additive and optional for backward compatibility.
- Financial mutation endpoints must be transaction-wrapped and idempotent.
