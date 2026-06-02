# Admin Dashboard Enhancement — Implementation Spec (Markup Prompt)

**Status:** Draft for approval  
**Goal:** Bring the admin experience up to the same polish as enhanced user/provider/supplier dashboards: fewer sidebar items, grouped navigation with expandable sections, and a new **Customers** area with list + detail flows mirroring Providers.

---

## 1. Problem statement

The admin sidebar currently exposes **8 flat top-level links** (Dashboard, Analytics, Providers, Suppliers, Categories, Jobs, Payments, Withdrawals). This feels crowded compared to other roles and repeats patterns we already solved elsewhere (summary cards, search, filters, row → detail).

We need:

1. **Grouped sidebar navigation** — parent items expand to show children (accordion / collapsible).
2. **New Customers section** — list page + detail page, aligned with Provider Management.
3. **No regression** — existing routes and behaviors for Providers, Suppliers, Categories, Jobs, Payments, Withdrawals, Analytics must keep working (URLs may stay the same; only nav grouping changes).

---

## 2. Current state (baseline)

| Item | Route | Page file |
|------|-------|-----------|
| Dashboard | `/admin/dashboard` | `frontend/src/pages/admin/Dashboard.tsx` |
| Analytics | `/admin/analytics` | `frontend/src/pages/admin/Analytics.tsx` |
| Providers | `/admin/providers` | `frontend/src/pages/admin/Providers.tsx` |
| Provider detail | `/admin/providers/:id` | `frontend/src/pages/admin/ProviderDetail.tsx` |
| Suppliers | `/admin/suppliers` | `frontend/src/pages/admin/Suppliers.tsx` |
| Categories | `/admin/categories` | `frontend/src/pages/admin/Categories.tsx` |
| Jobs | `/admin/jobs` | `frontend/src/pages/admin/Jobs.tsx` |
| Payments | `/admin/payments` | `frontend/src/pages/admin/Payments.tsx` |
| Withdrawals | `/admin/withdrawals` | `frontend/src/pages/admin/Withdrawals.tsx` |

**Nav definition today:** `adminNavItems` in `frontend/src/components/layout/DashboardLayout.tsx` (flat `NavItem[]`).

**Backend gap:** There is **no** `GET /admin/customers` (or equivalent) in `elofix-backend/src/routes/admin.routes.js`. Customer data exists as `User` rows with `role: CUSTOMER` and related `Job[]` — new admin APIs are required before the Customers UI can be fully wired.

---

## 3. Target sidebar structure

### 3.1 Information architecture

```
Dashboard                    → /admin/dashboard
Analytics                    → /admin/analytics

▼ Users                      (parent — expandable)
    Customers                → /admin/customers          [NEW]
    Providers                → /admin/providers
    Suppliers                → /admin/suppliers

▼ Work                       (parent — expandable)
    Jobs                     → /admin/jobs
    Categories               → /admin/categories

Payments                     → /admin/payments
Withdrawals                  → /admin/withdrawals
```

**Optional later grouping (out of scope unless requested):**

- Finance parent: Payments + Withdrawals  
- Not included in this phase to limit scope.

### 3.2 Interaction rules

| Behavior | Requirement |
|----------|-------------|
| Expand/collapse | Click parent label toggles children. Chevron rotates when open. |
| Auto-expand | If current route matches any child path, parent is **open** on load. |
| Active state | Child link uses existing `nav-link active` styling when `location.pathname` matches (including detail routes, e.g. `/admin/providers/:id` highlights **Providers**). |
| Mobile | Same accordion inside mobile drawer; closing drawer after navigation unchanged. |
| Accessibility | Parent is a `<button>` with `aria-expanded`; children in a nested list. Keyboard: Enter/Space toggles group. |

### 3.3 Implementation approach (frontend)

- Extend `DashboardLayout` nav model from flat `NavItem` to support **groups**:

```ts
type NavLink = { type: 'link'; label: string; path: string; icon: ReactNode };
type NavGroup = {
  type: 'group';
  label: string;
  icon: ReactNode;
  children: { label: string; path: string; icon?: ReactNode }[];
};
type AdminNavEntry = NavLink | NavGroup;
```

- Apply grouped nav **only for `role === 'admin'`**; other roles keep flat lists.
- Icons (suggested): Users → `Users`, Work → `Briefcase`, Customers → `User` or `UserCircle`.

---

## 4. Customers — list page (`/admin/customers`)

### 4.1 Page layout (match Providers / Suppliers patterns)

**Reference pages:** `Providers.tsx`, `Suppliers.tsx` (summary cards → toolbar → table).

```
┌─────────────────────────────────────────────────────────────┐
│ Customer Management                                          │
│ View registered customers, job activity, and revenue         │
├─────────────────────────────────────────────────────────────┤
│ [Card] Total registered    [Card] Total customer revenue     │
│        customers                  (platform-wide, paid)      │
├─────────────────────────────────────────────────────────────┤
│ [Search………………]  [City ▼]  [Status chips / filter btn]       │
│ Active filter chips + Clear all                              │
├─────────────────────────────────────────────────────────────┤
│ Table (sortable columns TBD)                                 │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Summary cards (top)

| Card | Label | Definition |
|------|-------|------------|
| 1 | **Registered customers** | Count of users with `role = CUSTOMER` (not soft-deleted if applicable). |
| 2 | **Total revenue (customers)** | Sum of **paid** customer spend in scope: paid labor (`meta.servicePayment`) + paid material batches (`meta.materialPayments`) across all customer jobs, **from platform inception through today** (same date semantics as admin dashboard commission card: `from: 2000-01-01` or dedicated backend aggregate). |

Display using existing `formatCurrency` and `Card` / `card-elevated` patterns from Suppliers page.

### 4.3 Table columns

| Column | Source / notes |
|--------|----------------|
| **Customer** | Name + email (+ avatar from `profileImage` if present) |
| **City** | Primary city for customer — **map from data** (see §6): e.g. most recent job `locationDetails.city` or normalized `location` string; show `—` if unknown |
| **Services requested** | Distinct categories across customer's jobs (category names, truncated with “+N more”) |
| **Completed** | Count `status === COMPLETED` |
| **In progress / active** | Count jobs in active workflow statuses (use `isActiveWorkflowStatus` from `jobStatusMapping.ts`) |
| **Not complete** | Count non-terminal jobs that are not completed (PENDING + active pipeline) — label TBD: “Open” or “In progress” |
| **Rejected** | Count `status === REJECTED` (and optionally `CANCELLED` if product wants them grouped — **confirm in implementation**) |
| **Registered** | `user.createdAt` formatted |
| **Actions** | “View” → navigate to detail |

**Row click:** Entire row (or View action) navigates to `/admin/customers/:id`.

### 4.4 Search & filters

Mirror `Providers.tsx`:

| Control | Behavior |
|---------|----------|
| **Search** | Filter by name, email, phone (case-insensitive) |
| **City dropdown** | Distinct cities from list payload |
| **Status filter** | Suggested: All \| Has active jobs \| Has completed jobs \| No jobs yet |
| **Filter chips** | Show active filters with ✕ to remove; “Clear all” link |

Optional **filter assistant** (phase 1.5): small helper text or popover explaining filters — only if time permits; not blocking MVP.

### 4.5 Empty / error / loading

- Skeleton rows while loading (same as Providers).
- Empty state: “No customers match your filters.”
- API error banner consistent with other admin pages (`Admin data not yet connected` pattern).

---

## 5. Customers — detail page (`/admin/customers/:id`)

### 5.1 Route & file

- Route: `/admin/customers/:id`
- File: `frontend/src/pages/admin/CustomerDetail.tsx`
- Guard: `AuthGuard allowedRoles={['admin']}`

### 5.2 Layout (mirror Provider detail)

**Reference:** `ProviderDetail.tsx` — back button, header card, sections, related lists.

**Sections:**

1. **Profile header** — avatar, name, email, phone, registration date, auth provider badge (Google vs local) if available.
2. **Location** — city / area from mapped fields; list of distinct service locations from jobs if useful.
3. **Job statistics** — cards or inline stats: total jobs, completed, active, rejected/cancelled, total paid amount for this customer.
4. **Jobs table** — sortable list: category, status badge (reuse `getJobDisplayStatusLabel` / admin badge classes), created date, amount; row click → `/admin/jobs/:jobId`.
5. **Payments summary** (optional v1) — link to filtered admin payments or inline last N paid transactions from job meta.
6. **Material orders** (optional v2) — if admin already has material-order APIs per user; defer unless easy join.

**Actions (admin):** Read-only for v1 unless product requests block/delete customer (not in scope).

---

## 6. Backend API contract (required — new)

Follow existing admin patterns in `admin.controller.js` + `admin.routes.js`. All routes: `authenticate` + `authorizeRoles(['ADMIN'])`.

### 6.1 `GET /admin/customers`

**Query params:** `search`, `city`, `status` (enum), `page`, `limit` (optional pagination).

**Response:**

```json
{
  "success": true,
  "summary": {
    "totalRegistered": 120,
    "totalRevenue": 450000.50
  },
  "customers": [
    {
      "id": "uuid",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+27...",
      "profileImage": "/api/files/...",
      "city": "Johannesburg",
      "registeredAt": "2025-01-15T10:00:00.000Z",
      "jobCounts": {
        "total": 5,
        "completed": 2,
        "active": 1,
        "open": 2,
        "rejected": 0,
        "cancelled": 0
      },
      "servicesRequested": ["Plumbing", "Electrical"],
      "totalPaid": 12500.00
    }
  ]
}
```

**Aggregation rules:**

- `jobCounts` derived from `Job` where `customerId = user.id`.
- `servicesRequested`: distinct `category` (resolve to display name via categories table if needed).
- `city`: derive from latest job’s `locationDetails` JSON (`.city` or equivalent) — document exact JSON path in service code; do not guess in frontend.
- `totalPaid` per customer: same revenue rules as platform analytics (paid labor + paid material).

### 6.2 `GET /admin/customers/:userId`

**Response:** full customer profile + `jobs[]` summary rows + aggregates for detail page.

### 6.3 Service layer

- New: `adminCustomers.service.js` (or extend `adminAnalytics.service.js` only if tiny).
- Use Prisma `user.findMany({ where: { role: 'CUSTOMER' } })` with job aggregates (`_count` / groupBy).
- Reuse revenue extraction from `adminAnalytics.service.js` (`aggregateRevenueFromMeta`) where possible — **no duplicate hidden formulas** (RULE-6).

### 6.4 Frontend API module

- New: `frontend/src/lib/api/adminCustomers.ts` with `getAdminCustomers()`, `getAdminCustomerById(id)`.
- Types in `frontend/src/types/index.ts`: `AdminCustomerListItem`, `AdminCustomerDetail`.

---

## 7. Routes to add (`App.tsx`)

```tsx
<Route path="/admin/customers" element={<AuthGuard allowedRoles={['admin']}><AdminCustomers /></AuthGuard>} />
<Route path="/admin/customers/:id" element={<AuthGuard allowedRoles={['admin']}><AdminCustomerDetail /></AuthGuard>} />
```

New pages:

- `frontend/src/pages/admin/Customers.tsx`
- `frontend/src/pages/admin/CustomerDetail.tsx`

---

## 8. Visual & UX consistency checklist

- [ ] Reuse `DashboardLayout`, `card-elevated`, `table-header`, `status-badge`, `formatCurrency`.
- [ ] Match Providers search/filter chip UX.
- [ ] Match Suppliers summary card grid (2–4 columns responsive).
- [ ] `animate-fade-in` on page container.
- [ ] Detail page: `ArrowLeft` back to list.
- [ ] Do not change landing/marketing pages (RULE-7 — admin-only scope).

---

## 9. Implementation phases

| Phase | Deliverable | Depends on |
|-------|-------------|------------|
| **A** | Grouped admin sidebar (Users, Work) | Frontend only |
| **B** | Backend `GET /admin/customers` + `GET /admin/customers/:id` | DB / Prisma |
| **C** | Customers list page + API wiring | B |
| **D** | Customer detail page | B |
| **E** | Dashboard quick-action link to Customers (optional) | C |

**Recommended order:** A → B → C → D → E.

---

## 10. Acceptance criteria

1. Admin sidebar shows **≤ 6 top-level items** with Users and Work as expandable groups.
2. Expanding **Users** shows Customers, Providers, Suppliers; **Work** shows Jobs, Categories.
3. Navigating to `/admin/providers/xyz` keeps **Users** expanded and **Providers** active.
4. **Customers** list loads from API with summary cards, search, city filter, and filter chips.
5. Clicking a customer opens detail with profile + job list; job row opens admin job detail.
6. Revenue and job counts match backend calculations (single source in admin service).
7. No existing admin URL breaks (bookmarks to `/admin/jobs` etc. still work).

---

## 11. Open questions (confirm before build)

1. **Rejected vs cancelled** — separate columns or single “Closed unsuccessfully” count?
2. **Customer city** — latest job only vs most frequent city across jobs?
3. **Revenue card** — gross customer payments vs platform commission (spec above uses **customer spend / gross paid**; confirm).
4. **Pagination** — required at launch if customer count > 100?
5. **Admin actions on customer** — block/delete needed in v1?

---

## 12. Files touched (estimate)

| Area | Files |
|------|--------|
| Layout | `DashboardLayout.tsx` |
| Routes | `App.tsx` |
| Pages | `Customers.tsx`, `CustomerDetail.tsx` (new) |
| API | `adminCustomers.ts` (new), `types/index.ts` |
| Backend | `admin.routes.js`, `admin.controller.js`, new service |

---

*End of spec — approve phases and open questions, then implementation can start.*
