# Delivery option change — production deploy

The fix that cancels courier child jobs when customers change delivery away from a provider must be deployed to your **production API host** (Netlify only hosts the frontend).

## 1. Deploy backend

From `elofix-backend`:

```bash
npm install
npm run prisma:deploy
npm run prisma:generate
npm test -- tests/materialOrder.deliveryOptionChange.test.js
# Deploy to your production host (Railway, Render, VPS, etc.) using your usual process
```

## 2. Verify Netlify env

In Netlify → Site settings → Environment variables, confirm:

- `VITE_API_BASE_URL` → your production API (e.g. `https://api.yourdomain.com/api`)
- `VITE_API_ORIGIN` → API origin without `/api`

Redeploy the Netlify site after backend deploy so the frontend picks up env if changed.

## 3. Repair stuck jobs (one-time)

Jobs left `PENDING` before this deploy can be repaired:

**Admin API** (requires ADMIN token):

```http
POST /api/admin/maintenance/repair-stale-courier-jobs
Content-Type: application/json

{ "limit": 200 }
```

**CLI script:**

```bash
node scripts/repair-stale-courier-jobs.js
```

Self-healing also runs when:

- Customer opens a material order (`GET /material-orders/:id`)
- Customer loads My Jobs (`GET /jobs`)
- Provider loads pending requests (`GET /jobs/match`)

## 4. Smoke test on production

1. Customer: material order with provider delivery → change to Store delivery
2. Customer My Jobs: material delivery job should show **Cancelled** (not Pending)
3. Provider Requests: job removed from Pending, appears under **Canceled**
