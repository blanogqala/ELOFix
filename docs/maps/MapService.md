# Map Service API

Backend proxies keep third-party API keys off the client.

## Geocoding

Base path: `/api/geocode`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/reverse?lat=&lng=` | Required | Coords → address (OpenCage → Nominatim) |
| GET/POST | `/forward?q=` | Public (rate limited) | Address → `{ lat, lng, label }` via Nominatim |
| GET/POST | `/search?q=` | Required | Autocomplete suggestions via Nominatim |

### Forward response

```json
{
  "success": true,
  "lat": -33.9249,
  "lng": 18.4241,
  "coordinates": { "lat": -33.9249, "lng": 18.4241 },
  "label": "Cape Town, South Africa"
}
```

## Routing

Base path: `/api/routing`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/directions?originLat&originLng&destLat&destLng` | Public (rate limited) | Driving route via OpenRouteService |

### Directions response

```json
{
  "success": true,
  "durationText": "12 mins",
  "durationSeconds": 720,
  "distanceMeters": 5400,
  "geometry": {
    "type": "LineString",
    "coordinates": [[18.4241, -33.9249], [18.43, -33.93]]
  },
  "bounds": {
    "sw": { "lat": -33.93, "lng": 18.42 },
    "ne": { "lat": -33.92, "lng": 18.43 }
  }
}
```

## Rate Limiting

- Geocode: 30 requests / minute / IP
- Routing: 40 requests / minute / IP

## Caching

- Geocode forward/search: in-memory LRU (10 min TTL)
- Routing: in-memory LRU (2 min TTL, configurable)
- Frontend: sessionStorage cache for routes and geocode results

## Implementation Files

- `elofix-backend/src/services/geocode.service.js`
- `elofix-backend/src/services/routing.service.js`
- `frontend/src/lib/map/routeApi.ts`
- `frontend/src/lib/api/geocode.ts`
