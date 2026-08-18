# Map Deployment

## Frontend (Netlify / static host)

1. Set `VITE_API_BASE_URL` to your production API (`https://api.example.com/api`).
2. **Tiles (production):** set `VITE_MAPTILER_API_KEY` with domain referrer restrictions in [MapTiler Cloud](https://cloud.maptiler.com/).
3. **Tiles (dev/staging):** leave `VITE_MAPTILER_API_KEY` unset — OpenFreeMap is used automatically.
4. Remove any legacy `VITE_GOOGLE_MAPS_API_KEY` from deploy env vars.

## Backend (Render / Node host)

1. Set `OPENROUTESERVICE_API_KEY` — create at [openrouteservice.org](https://openrouteservice.org/dev/#/signup).
2. Keep existing geocode vars for reverse geocoding:
   - `OPENCAGE_API_KEY` (optional primary)
   - `GEOCODE_USER_AGENT`, `GEOCODE_CONTACT_EMAIL` (Nominatim policy)
3. Optional tuning:
   - `ROUTING_FETCH_TIMEOUT_MS=15000`
   - `ROUTING_CACHE_TTL_MS=120000`

## Key Rotation

| Key | Where | Action |
|-----|-------|--------|
| OpenRouteService | Backend env only | Rotate in ORS dashboard; redeploy API |
| MapTiler | Frontend env (public) | Restrict by HTTP referrer; rotate in MapTiler dashboard |
| OpenCage | Backend env | Rotate in OpenCage dashboard |

## Verification Checklist

- [ ] `/track/:trackingId` renders map without Google network requests
- [ ] Customer order detail shows live driver marker + ETA
- [ ] Provider external navigation opens OSM directions
- [ ] `npm run build` succeeds in frontend
- [ ] Backend tests: `node tests/geocode.forward.test.js && node tests/routing.service.test.js`
