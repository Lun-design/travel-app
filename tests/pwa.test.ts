import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectFile = (...parts: string[]) => path.resolve(process.cwd(), ...parts);

describe('PWA deployment configuration', () => {
  it('defines the installable manifest and iOS metadata', () => {
    const manifest = JSON.parse(readFileSync(projectFile('public', 'manifest.json'), 'utf8')) as Record<string, unknown>;
    const html = readFileSync(projectFile('src', 'app', '+html.tsx'), 'utf8');

    expect(manifest.name).toBe('大白小白出遊去');
    expect(manifest.short_name).toBe('大白出遊');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#F8F6F0');
    expect(manifest.theme_color).toBe('#9A6A45');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('apple-mobile-web-app-title');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="大白小白gogogo" />');
    expect(html).toContain("/manifest.json");
  });

  it('ships a real 180x180 Apple touch icon instead of a text fallback', () => {
    const iconPath = projectFile('public', 'apple-touch-icon.png');
    expect(existsSync(iconPath)).toBe(true);
    const png = readFileSync(iconPath);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });

  it('keeps the iOS install metadata in the generated static entry document', () => {
    const distHtmlPath = projectFile('dist', 'index.html');
    expect(existsSync(distHtmlPath)).toBe(true);
    const distHtml = readFileSync(distHtmlPath, 'utf8');
    expect(distHtml).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
    expect(distHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(distHtml).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(distHtml).toContain('<meta name="apple-mobile-web-app-title" content="大白小白gogogo" />');
  });

  it('points Expo and PWA branding to the custom puppy PNG icons', () => {
    const appConfig = JSON.parse(readFileSync(projectFile('app.json'), 'utf8')) as {
      expo?: {
        name?: string;
        icon?: string;
        ios?: { icon?: string };
        android?: { adaptiveIcon?: { foregroundImage?: string; backgroundImage?: string; monochromeImage?: string } };
        web?: { favicon?: string; name?: string; shortName?: string };
      };
    };
    const manifest = JSON.parse(readFileSync(projectFile('public', 'manifest.json'), 'utf8')) as {
      name?: string;
      short_name?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string }>;
    };

    expect(appConfig.expo?.name).toBe('大白小白出遊去');
    expect(appConfig.expo?.icon).toBe('./icon.png');
    expect(appConfig.expo?.ios?.icon).toBe('./icon.png');
    expect(appConfig.expo?.android?.adaptiveIcon?.foregroundImage).toBe('./icon.png');
    expect(appConfig.expo?.android?.adaptiveIcon?.backgroundImage).toBeUndefined();
    expect(appConfig.expo?.android?.adaptiveIcon?.monochromeImage).toBeUndefined();
    expect(appConfig.expo?.web?.favicon).toBe('./favicon.png');
    expect(appConfig.expo?.web?.name).toBe('大白小白出遊去');
    expect(appConfig.expo?.web?.shortName).toBe('大白出遊');
    expect(existsSync(projectFile('icon.png'))).toBe(true);
    expect(existsSync(projectFile('favicon.png'))).toBe(true);
    expect(manifest.name).toBe('大白小白出遊去');
    expect(manifest.short_name).toBe('大白出遊');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/icon.png', sizes: '512x512', type: 'image/png' }),
    ]));
  });

  it('uses versioned caches and activates the latest service worker', () => {
    const serviceWorker = readFileSync(projectFile('public', 'sw.js'), 'utf8');

    expect(serviceWorker).toContain('__BUILD_VERSION__');
    expect(serviceWorker).toContain('self.skipWaiting()');
    expect(serviceWorker).toContain('self.clients.claim()');
    expect(serviceWorker).toContain("cache: 'no-store'");
    expect(serviceWorker).toContain('PRECACHE_URLS');
    expect(serviceWorker).toContain("'/apple-touch-icon.png'");
    expect(serviceWorker).toContain('BUILD_PRECACHED_URLS');
    expect(serviceWorker).toContain('isCacheableResource');
    expect(serviceWorker).toContain("request.destination === 'image'");
    expect(serviceWorker).toContain("request.destination === 'document'");
    expect(serviceWorker).toContain("response.type === 'opaque'");
  });

  it('does not cache private Supabase data and supports runtime-cache cleanup', () => {
    const serviceWorker = readFileSync(projectFile('public', 'sw.js'), 'utf8');
    const cacheableFunction = serviceWorker.slice(
      serviceWorker.indexOf('function isCacheableResource'),
      serviceWorker.indexOf("self.addEventListener('fetch'"),
    );

    expect(serviceWorker).toContain('isPrivateDataResource');
    expect(serviceWorker).toContain('CLEAR_RUNTIME_CACHE');
    expect(cacheableFunction).toContain('if (isPrivateDataResource(url)) return false;');
    expect(cacheableFunction).toContain('if (url.origin !== self.location.origin) return false;');
    expect(cacheableFunction).not.toContain('rest\\/v1');
    expect(cacheableFunction).not.toContain('storage\\/v1');
  });

  it('defines a verified Vercel build and route fallback', () => {
    const vercel = JSON.parse(readFileSync(projectFile('vercel.json'), 'utf8')) as { buildCommand?: string; outputDirectory?: string; rewrites?: Array<{ destination?: string }> };
    const packageJson = JSON.parse(readFileSync(projectFile('package.json'), 'utf8')) as { scripts?: Record<string, string> };

    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites?.some((rewrite) => rewrite.destination === '/')).toBe(true);
    expect(packageJson.scripts?.['type-check']).toBe('tsc --noEmit');
    expect(packageJson.scripts?.build).toContain('npm run type-check');
    expect(packageJson.scripts?.build).toContain('npm run test:ci');
    expect(packageJson.scripts?.['build:web']).toContain('generate-service-worker.mjs');
  });
});
