# Map Environment Variables

## Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Backend API base (includes `/api`) |
| `VITE_MAPTILER_API_KEY` | Production | MapTiler style key (domain-restricted). Omit for OpenFreeMap in dev. |

### Removed

- `VITE_GOOGLE_MAPS_API_KEY` — no longer used

## Backend (`elofix-backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTESERVICE_API_KEY` | Yes (for routes) | OpenRouteService driving directions |
| `OPENCAGE_API_KEY` | Optional | Reverse geocode primary provider |
| `GEOCODE_USER_AGENT` | Recommended | Nominatim usage policy |
| `GEOCODE_CONTACT_EMAIL` | Recommended | Nominatim contact email |
| `GEOCODE_FETCH_TIMEOUT_MS` | Optional | Default 20000 |
| `ROUTING_FETCH_TIMEOUT_MS` | Optional | Default 15000 |
| `ROUTING_CACHE_TTL_MS` | Optional | Default 120000 |

### Unchanged (not map-related)

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth sign-in only
- Firebase auth vars — authentication only

## Local Development

```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:5000/api
# VITE_MAPTILER_API_KEY=   # optional; OpenFreeMap used when unset

# elofix-backend/.env
OPENROUTESERVICE_API_KEY=your-ors-key
GEOCODE_USER_AGENT=ELOFix/1.0
GEOCODE_CONTACT_EMAIL=you@example.com
```

Restart Vite after changing frontend env vars.
