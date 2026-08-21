import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

describe('production HTML metadata (Block 6)', () => {
  it('uses an EloFix production document title', () => {
    expect(indexHtml).toMatch(/<title>EloFix \| Services & Materials Marketplace South Africa<\/title>/);
    expect(indexHtml).not.toMatch(/Lovable|Vite App|React App/i);
  });

  it('has production meta description and canonical', () => {
    expect(indexHtml).toContain('name="description"');
    expect(indexHtml).toContain('LITI Holdings (Pty) Ltd');
    expect(indexHtml).toContain('rel="canonical" href="https://www.elofix.co.za/"');
  });

  it('has EloFix Open Graph and Twitter metadata without Lovable', () => {
    expect(indexHtml).toContain('property="og:title" content="EloFix | Services & Materials Marketplace South Africa"');
    expect(indexHtml).toContain('property="og:url" content="https://www.elofix.co.za/"');
    expect(indexHtml).toContain('property="og:site_name" content="EloFix"');
    expect(indexHtml).toContain('property="og:locale" content="en_ZA"');
    expect(indexHtml).toContain('property="og:image" content="https://www.elofix.co.za/hero-background.png"');
    expect(indexHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(indexHtml).toContain('name="twitter:title"');
    expect(indexHtml).toContain('name="twitter:image" content="https://www.elofix.co.za/hero-background.png"');
    expect(indexHtml).not.toMatch(/lovable\.dev|@Lovable|Lovable Generated Project/i);
  });

  it('references EloFix-owned favicon assets', () => {
    expect(indexHtml).toContain('href="/favicon.ico"');
    expect(indexHtml).toContain('apple-mobile-web-app-title" content="EloFix"');
    expect(indexHtml).toContain('theme-color" content="#0A2540"');
  });
});
