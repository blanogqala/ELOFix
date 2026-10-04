/**
 * Store-delivery live tracking in a real browser.
 * Geolocation is mocked. Routing and map tiles are stubbed so OpenRouteService is never called.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { login } from './fixtures';

const FIXTURE_SCRIPT = path.resolve(
  process.cwd(),
  '../elofix-backend/scripts/e2e-store-delivery-tracking-fixture.js'
);

const DRIVER_START = { lat: -33.8, lng: 18.5 };
const DRIVER_MOVED = { lat: -33.85, lng: 18.45 };

const EMPTY_MAP_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e7eef5' } }],
});

type Fixture = {
  password: string;
  customerEmail: string;
  staffEmail: string;
  orderId: string;
  destination: { lat: number; lng: number; address: string };
  ids: Record<string, string>;
};

type LatLng = { lat: number; lng: number };

function runFixture(args: string[]): string {
  return execFileSync(process.execPath, [FIXTURE_SCRIPT, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
}

function createFixture(): Fixture {
  const stdout = runFixture(['create']).trim();
  const line = stdout.split(/\r?\n/).filter(Boolean).pop() || '';
  return JSON.parse(line) as Fixture;
}

function destroyFixture(fixture: Fixture | null) {
  if (!fixture) return;
  execFileSync(process.execPath, [FIXTURE_SCRIPT, 'destroy', JSON.stringify({ ids: fixture.ids })], {
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });
}

function near(actual: LatLng, expected: LatLng) {
  return Math.abs(actual.lat - expected.lat) < 0.0002 && Math.abs(actual.lng - expected.lng) < 0.0002;
}

/** Deterministic watchPosition. Native setGeolocation can error an active watch in headless Chrome. */
async function installMockGeolocation(context: BrowserContext, start: LatLng) {
  await context.addInitScript((initial: LatLng) => {
    const state = { lat: initial.lat, lng: initial.lng };
    const watches = new Map<number, (pos: GeolocationPosition) => void>();
    let nextId = 1;
    const position = () =>
      ({
        coords: {
          latitude: state.lat,
          longitude: state.lng,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      }) as GeolocationPosition;
    const geo: Geolocation = {
      getCurrentPosition(success) {
        success(position());
      },
      watchPosition(success) {
        const id = nextId++;
        watches.set(id, success);
        success(position());
        return id;
      },
      clearWatch(id) {
        watches.delete(id);
      },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
    (window as unknown as { __setMockGeo?: (lat: number, lng: number) => void }).__setMockGeo = (lat, lng) => {
      state.lat = lat;
      state.lng = lng;
      for (const success of watches.values()) success(position());
    };
  }, start);
}

async function pushMockGeolocation(page: Page, point: LatLng) {
  await page.evaluate(({ lat, lng }) => {
    (window as unknown as { __setMockGeo?: (lat: number, lng: number) => void }).__setMockGeo?.(lat, lng);
  }, point);
}

async function fulfillEmptyMapStyle(route: Route) {
  const type = route.request().resourceType();
  if (type === 'document' || route.request().url().includes('/styles/')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: EMPTY_MAP_STYLE });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
}

async function installTrackingMocks(page: Page, origins: LatLng[]) {
  await page.route('**/tiles.openfreemap.org/**', fulfillEmptyMapStyle);
  await page.route('**/api.maptiler.com/**', fulfillEmptyMapStyle);
  await page.route('**/geocode/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        lat: -33.92487,
        lng: 18.42406,
        label: '1 Adderley Street, Cape Town',
        coordinates: { lat: -33.92487, lng: 18.42406 },
      }),
    });
  });
  await page.route('**/routing/directions**', async (route) => {
    const url = new URL(route.request().url());
    const origin = {
      lat: Number(url.searchParams.get('originLat')),
      lng: Number(url.searchParams.get('originLng')),
    };
    const dest = {
      lat: Number(url.searchParams.get('destLat')),
      lng: Number(url.searchParams.get('destLng')),
    };
    origins.push(origin);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        durationText: '0 sec',
        durationSeconds: 0,
        distanceMeters: 8000,
        geometry: {
          type: 'LineString',
          coordinates: [
            [origin.lng, origin.lat],
            [dest.lng, dest.lat],
          ],
        },
        bounds: {
          sw: {
            lat: Math.min(origin.lat, dest.lat) - 0.02,
            lng: Math.min(origin.lng, dest.lng) - 0.02,
          },
          ne: {
            lat: Math.max(origin.lat, dest.lat) + 0.02,
            lng: Math.max(origin.lng, dest.lng) + 0.02,
          },
        },
      }),
    });
  });
}

async function advanceFulfillment(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  const response = page.waitForResponse(
    (res) => res.url().includes('/fulfillment') && res.request().method() === 'PATCH',
    { timeout: 30_000 }
  );
  await button.click();
  const result = await response;
  expect(result.ok(), `${name} failed: ${result.status()} ${await result.text()}`).toBeTruthy();
}

test('store delivery live tracking is staff-published and customer-read-only', async ({ browser }) => {
  test.setTimeout(180_000);
  let fixture: Fixture | null = null;
  let staffContext: BrowserContext | null = null;
  let customerContext: BrowserContext | null = null;
  let publicContext: BrowserContext | null = null;
  const externalCalls: string[] = [];
  const routeOrigins: LatLng[] = [];

  try {
    fixture = createFixture();
    const order = fixture;

    staffContext = await browser.newContext();
    await installMockGeolocation(staffContext, DRIVER_START);
    const staffPage = await staffContext.newPage();
    await login(staffPage, order.staffEmail, order.password);
    await staffPage.goto(`/supplier/orders?orderId=${encodeURIComponent(order.orderId)}`, {
      waitUntil: 'domcontentloaded',
    });

    await advanceFulfillment(staffPage, 'Accept order');
    await advanceFulfillment(staffPage, 'Start preparing');
    await advanceFulfillment(staffPage, 'Mark ready');
    await advanceFulfillment(staffPage, 'Out for delivery');

    const shareButton = staffPage.getByRole('button', { name: 'Start sharing delivery location' });
    await expect(shareButton).toBeVisible();
    await expect(shareButton).toBeEnabled({ timeout: 20_000 });
    await expect(staffPage.getByText(/\/track\//).first()).toBeVisible();

    customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    customerPage.on('request', (request) => {
      if (/openrouteservice|nominatim/i.test(request.url())) externalCalls.push(request.url());
    });
    await installTrackingMocks(customerPage, routeOrigins);
    await login(customerPage, order.customerEmail, order.password);
    await customerPage.goto(`/user/material-orders/${encodeURIComponent(order.orderId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(customerPage.getByText(order.destination.address).first()).toBeVisible({ timeout: 30_000 });
    await expect(customerPage.getByText('ETA 0 sec')).toHaveCount(0);

    const firstPublish = staffPage.waitForResponse(
      (res) => res.url().includes('/tracking/update') && res.request().method() === 'POST'
    );
    await shareButton.click();
    const published = await firstPublish;
    expect(published.ok(), `staff GPS publish failed: ${published.status()}`).toBeTruthy();
    await expect(staffPage.getByText('Sharing active')).toBeVisible();
    await expect(staffPage.getByText('-33.80000, 18.50000')).toBeVisible({ timeout: 20_000 });

    await expect(customerPage.getByText('Driver is on the way')).toBeVisible({ timeout: 20_000 });
    await expect(customerPage.getByText('Driver arriving')).toHaveCount(0);
    await expect(customerPage.locator('.elofix-map-marker-vehicle')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => routeOrigins.some((origin) => near(origin, DRIVER_START)), { timeout: 20_000 }).toBe(true);
    await expect(customerPage.getByText(/ETA\s*0\s*sec/i)).toHaveCount(0);

    await staffPage.waitForTimeout(5_500);
    const movedPublish = staffPage.waitForResponse(
      (res) => res.url().includes('/tracking/update') && res.request().method() === 'POST',
      { timeout: 20_000 }
    );
    await pushMockGeolocation(staffPage, DRIVER_MOVED);
    const moved = await movedPublish;
    expect(moved.ok(), `moved GPS publish failed: ${moved.status()}`).toBeTruthy();
    await expect(staffPage.getByText('-33.85000, 18.45000')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => routeOrigins.some((origin) => near(origin, DRIVER_MOVED)), { timeout: 20_000 }).toBe(true);
    await expect(customerPage.locator('.elofix-map-marker-vehicle')).toBeVisible();
    await expect(customerPage.getByText('Driver is on the way')).toBeVisible();
    await expect(customerPage.getByText(/ETA\s*0\s*sec/i)).toHaveCount(0);
    expect(externalCalls, 'routing must stay mocked').toEqual([]);

    await staffPage.getByRole('button', { name: 'Stop sharing location' }).click();
    await customerPage.route('**/tracking/latest/**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.lastPingAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    await expect(customerPage.getByText('Live location temporarily unavailable')).toBeVisible({ timeout: 25_000 });
    await expect(customerPage.getByText('Driver is on the way')).toHaveCount(0);
    await expect(customerPage.getByText('Driver arriving')).toHaveCount(0);
    await expect(customerPage.getByText(/ETA\s*0\s*sec/i)).toHaveCount(0);

    const trackLink = (await staffPage.getByText(/\/track\//).first().innerText()).trim();
    const trackUrl = new URL(trackLink);
    publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const publicGpsPosts: string[] = [];
    await publicPage.addInitScript(() => {
      const target = window as unknown as { __elofixGeoCalls?: string[] };
      target.__elofixGeoCalls = [];
      const geo = navigator.geolocation;
      if (!geo) return;
      const watch = geo.watchPosition.bind(geo);
      const current = geo.getCurrentPosition.bind(geo);
      geo.watchPosition = ((...args: Parameters<Geolocation['watchPosition']>) => {
        target.__elofixGeoCalls?.push('watch');
        return watch(...args);
      }) as Geolocation['watchPosition'];
      geo.getCurrentPosition = ((...args: Parameters<Geolocation['getCurrentPosition']>) => {
        target.__elofixGeoCalls?.push('current');
        return current(...args);
      }) as Geolocation['getCurrentPosition'];
    });
    publicPage.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/tracking/update')) {
        publicGpsPosts.push(request.url());
      }
    });
    await installTrackingMocks(publicPage, []);
    await publicPage.goto(`${trackUrl.pathname}${trackUrl.search}`, { waitUntil: 'domcontentloaded' });
    await expect(publicPage.getByText('does not publish GPS')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => publicPage.evaluate(() => (window as unknown as { __elofixGeoCalls?: string[] }).__elofixGeoCalls || [])).toEqual([]);
    expect(publicGpsPosts).toEqual([]);

    const session = await customerPage.evaluate(() => {
      const raw = localStorage.getItem('fixmate_auth');
      return raw ? (JSON.parse(raw) as { token?: string }) : null;
    });
    expect(session?.token).toBeTruthy();
    const denied = await customerPage.request.post('/api/tracking/update', {
      headers: { Authorization: `Bearer ${session?.token}` },
      data: {
        trackingId: trackUrl.pathname.split('/').pop(),
        lat: -33.7,
        lng: 18.3,
        token: trackUrl.searchParams.get('token'),
      },
    });
    expect(denied.status(), await denied.text()).toBe(403);
  } finally {
    await publicContext?.close().catch(() => {});
    await customerContext?.close().catch(() => {});
    await staffContext?.close().catch(() => {});
    destroyFixture(fixture);
  }
});
