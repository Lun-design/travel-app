import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectFile = (...parts: string[]) => path.resolve(process.cwd(), ...parts);

describe('PWA deployment configuration', () => {
  it('defines the installable manifest and iOS metadata', () => {
    const manifest = JSON.parse(readFileSync(projectFile('public', 'manifest.json'), 'utf8')) as Record<string, unknown>;
    const html = readFileSync(projectFile('src', 'app', '+html.tsx'), 'utf8');

    expect(manifest.name).toContain('出遊由起來');
    expect(manifest.short_name).toBe('出遊由起來');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#ffffff');
    expect(manifest.theme_color).toBe('#4f46e5');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('apple-mobile-web-app-title');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain("/manifest.json");
  });

  it('uses versioned caches and activates the latest service worker', () => {
    const serviceWorker = readFileSync(projectFile('public', 'sw.js'), 'utf8');

    expect(serviceWorker).toContain('__BUILD_VERSION__');
    expect(serviceWorker).toContain('self.skipWaiting()');
    expect(serviceWorker).toContain('self.clients.claim()');
    expect(serviceWorker).toContain("cache: 'no-store'");
    expect(serviceWorker).toContain('PRECACHE_URLS');
    expect(serviceWorker).toContain('BUILD_PRECACHED_URLS');
  });

  it('defines a verified Vercel build and route fallback', () => {
    const vercel = JSON.parse(readFileSync(projectFile('vercel.json'), 'utf8')) as { buildCommand?: string; outputDirectory?: string; rewrites?: Array<{ destination?: string }> };
    const packageJson = JSON.parse(readFileSync(projectFile('package.json'), 'utf8')) as { scripts?: Record<string, string> };

    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites?.some((rewrite) => rewrite.destination === '/index.html')).toBe(true);
    expect(packageJson.scripts?.['type-check']).toBe('tsc --noEmit');
    expect(packageJson.scripts?.build).toContain('npm run type-check');
    expect(packageJson.scripts?.build).toContain('npm test');
    expect(packageJson.scripts?.['build:web']).toContain('generate-service-worker.mjs');
  });
});
