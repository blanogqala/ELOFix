# Image storage on Render (production)

## What you're seeing

When you open an image URL on `elofix-6136.onrender.com` and get:

```json
{"success":false,"message":"File not found","code":"NOT_FOUND"}
```

the frontend is correct — the **file no longer exists on the API server**. Render wipes local disk on every deploy. The database still has the file id (`/api/files/8534b2d0-...`) but the bytes are gone.

**Already-uploaded images cannot be recovered** unless you have a backup. Users must re-upload after storage is fixed.

---

## Fix option A — Cloudflare R2 (recommended, works on Render Free)

R2 is S3-compatible object storage. New uploads are mirrored there automatically when env vars are set.

### 1. Create R2 bucket

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → **Create bucket** (e.g. `elofix-uploads`)
2. **Manage R2 API tokens** → Create token with Object Read & Write on that bucket
3. Note: Account ID, Access Key ID, Secret Access Key
4. Optional: enable **Public access** on the bucket and note the public URL (`https://pub-xxx.r2.dev`)

### 2. Set Render environment variables

On **elofix-api** → **Environment**:

```
S3_BUCKET=elofix-uploads
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<your key>
S3_SECRET_ACCESS_KEY=<your secret>
S3_REGION=auto
# Optional — direct public URLs (not required; API still serves files):
# S3_PUBLIC_URL=https://pub-xxx.r2.dev
```

### 3. Deploy backend

Push/deploy the latest `elofix-backend` code, then **Manual Deploy** on Render.

### 4. Re-upload images

Providers, suppliers, and customers must **upload photos again**. New uploads will persist across deploys.

---

## Fix option B — Render persistent disk (Starter+ plan)

1. Upgrade **elofix-api** to **Starter** or higher
2. **Disks** → Add disk:
   - Mount path: `/opt/render/project/src/uploads`
   - Size: 10 GB
3. Environment:
   ```
   UPLOAD_ROOT=/opt/render/project/src/uploads
   ```
4. Redeploy, then re-upload all images

---

## Netlify (frontend)

Confirm before each production build:

```
VITE_API_BASE_URL=https://elofix-6136.onrender.com/api
VITE_API_ORIGIN=https://elofix-6136.onrender.com
```

Redeploy Netlify after changing env vars.

---

## Verify after fix

1. Upload a new portfolio image as a provider
2. Open the image URL directly — should return image bytes (200), not JSON 404
3. Trigger a Render redeploy
4. Image should still load

```bash
curl -I "https://elofix-6136.onrender.com/api/files/<new-file-uuid>"
```

---

## Local development

Object storage is optional locally. Without `S3_*` vars, files stay in `elofix-backend/uploads/` as before.
