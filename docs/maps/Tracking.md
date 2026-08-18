# Live Tracking Integration

## Persistence (PostgreSQL)

`TrackingSession` stores:

- `trackingId`, `accessToken`
- `lastLat`, `lastLng`, `lastPingAt`
- Linked to `orderId` or `deliveryRequestId`

No route geometry is persisted — routes are computed client-side per session.

## Real-Time (Socket.IO)

| Event | Direction | Payload |
|-------|-----------|---------|
| `order:join` | Client → Server | Join order room for live updates |
| `update_location` | Driver → Server | `{ orderId, lat, lng }` |
| `order:location:update` | Server → Clients | Latest driver coordinates |

## REST

| Endpoint | Purpose |
|----------|---------|
| `GET /tracking/:trackingId` | Public tracking metadata |
| `POST /tracking/update` | Driver GPS upload (token optional) |
| `GET /tracking/latest/:orderId` | Poll fallback for customers |

## Frontend Pipeline

1. **Driver** — `TrackDelivery.tsx` or provider courier hooks upload GPS (throttled via `geolocationSendGate.ts`).
2. **Customer** — `useOrderLocationSocket.ts` receives socket updates + polls latest.
3. **Map** — `DeliveryMap` receives `lat`/`lng` props, smooths movement (`smoothCoords.ts`), fetches route/ETA, renders MapLibre markers.

## Throttling

- GPS upload gate: distance + time thresholds in `geolocationSendGate.ts`
- Map display gate: `useStableMapCoords.ts` (>10 m or >3 s)
- Route refresh: re-fetches when raw driver position changes

## Proximity Banners (unchanged business rules)

- Near: &lt; 500 m (haversine)
- Arriving: &lt; 120 m

Callbacks: `onProximityChange`, `onEtaChange` on `DeliveryMap`.
