import { execFileSync } from 'node:child_process';
import path from 'node:path';

function isRemotePlaywrightBase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]';
  } catch {
    return false;
  }
}

/**
 * Seed disposable local/CI marketplace rows before Playwright workers start.
 * Hosted staging runs do not seed. The script refuses production and remote databases.
 */
export default function globalSetup() {
  if (isRemotePlaywrightBase(process.env.PLAYWRIGHT_BASE_URL)) return;
  const script = path.resolve(process.cwd(), '../elofix-backend/scripts/seed-e2e-marketplace.js');
  execFileSync(process.execPath, [script], {
    stdio: 'inherit',
    env: process.env,
  });
}
