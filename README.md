# LOFix (FixMate) - MVC Full-Stack Starter

This folder keeps your original MVP **unchanged** under `legacy-mvp/` and adds a clean full-stack structure:

- `frontend/` - your current Vite + React app (enhanced to support Firebase mode)
- `backend/` - new Express + TypeScript API using an MVC-ish folder layout
- `legacy-mvp/` - untouched copy of the exact folder you uploaded

## Quick start (mock mode: zero setup)

### 1) Frontend
```bash
cd frontend
npm i
npm run dev
```

### 2) Backend (optional for mock mode)
Not required if you stay in mock mode.

## Enable real Auth + DB (Firebase)

### A) Create a Firebase project (free tier)
1. Firebase console -> create project
2. Add a **Web app** -> copy config into `frontend/.env` (see `.env.example`)
3. Enable Auth providers: Email/Password + Google
4. Generate Admin SDK service account -> download JSON

### B) Configure backend env
Create `backend/.env` from `.env.example`.
From your service account JSON:
- `project_id` -> `FIREBASE_PROJECT_ID`
- `client_email` -> `FIREBASE_CLIENT_EMAIL`
- `private_key` -> `FIREBASE_PRIVATE_KEY` (replace line breaks with `\n`)

### C) Run backend
```bash
cd backend
npm i
npm run dev
```
Backend runs on `http://localhost:4000/api/health`.

### D) Turn on Firebase in frontend
Create `frontend/.env` from `.env.example` and set:
```
VITE_USE_FIREBASE=true
```

Then:
```bash
cd frontend
npm run dev
```

## What is implemented

### Backend (MVC skeleton)
- `/api/health`
- `/api/auth/session` (POST) - create/update a profile in Firestore (requires Firebase ID token)
- `/api/auth/me` (GET) - fetch profile (requires token)

Collections:
- `userProfiles/{uid}`

Next additions (already planned in the folder layout):
- `requests` (jobs), `quotes`, `providers`, `materials`, `uploads`

## Notes
- This is designed so you can start free and scale later.
- If you want, we can add Stripe/PayFast later for payments.

## Maps (MapLibre + OpenStreetMap)

Live delivery tracking uses **MapLibre GL JS** with OSM tiles. Google Maps has been fully removed.

- **Docs:** [`docs/maps/`](docs/maps/) — architecture, API contracts, deployment, env vars
- **Frontend env:** `VITE_MAPTILER_API_KEY` (production tiles; OpenFreeMap used when unset)
- **Backend env:** `OPENROUTESERVICE_API_KEY` (driving directions proxy)
- **Tracking data:** PostgreSQL `TrackingSession` + Socket.IO (not Firestore)
