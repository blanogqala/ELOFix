# Image storage on Render (production)

## Problem

EloFix stores uploads on the API server's local disk (`elofix-backend/uploads/`). Render's **default filesystem is ephemeral**: every deploy or restart wipes that folder. The database still references files (`/api/files/{uuid}` or `/uploads/...`), so the UI shows broken images (404).

This affects portfolio photos, job images, review media, supplier product images, branch logos, and avatars.

## Fix: persistent disk (recommended)

1. **Upgrade** the `elofix-api` service to at least **Starter** (persistent disks are not available on Free).
2. In Render → **elofix-api** → **Disks** → **Add disk**:
   - **Mount path:** `/opt/render/project/src/uploads`
   - **Size:** start with 10 GB (can increase later, not decrease)
3. In **Environment**, set:
   ```
   UPLOAD_ROOT=/opt/render/project/src/uploads
   ```
4. **Redeploy** the API service.

New uploads will survive future deploys.

## Netlify (frontend)

Confirm these are set before each production build:

```
VITE_API_BASE_URL=https://YOUR-RENDER-API.onrender.com/api
VITE_API_ORIGIN=https://YOUR-RENDER-API.onrender.com
```

`VITE_API_ORIGIN` is used for `<img src>` URLs. If only `VITE_API_BASE_URL` is set, the frontend now falls back to its origin — but set both explicitly.

Redeploy Netlify after changing env vars so CSP `_headers` includes your API host.

## Already broken images

Files lost before adding the disk **cannot be recovered** from the server. Affected users must **re-upload**:

- Provider portfolio / work posts
- Job request photos
- Supplier product & branch images
- Customer completion / review photos

## Verify

```bash
# Should return 200 with image content-type (use a known file id from the API)
curl -I "https://YOUR-RENDER-API.onrender.com/api/files/{uuid}"
```

In browser DevTools → Network, failed images should request your Render host, not `localhost:5000`.

## Long-term

For scale and backups, consider object storage (AWS S3, Cloudflare R2, Cloudinary) instead of local disk.
