import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Vercel dynamic Expo routes', () => {
  it('routes dynamic pages to the SPA entry without bracketed static destinations', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual([
      { source: '/share/:path*', destination: '/index.html' },
      { source: '/trips/:path*', destination: '/index.html' },
      {
        source: '/((?!_expo|assets|favicon.ico|.*\\.js|.*\\.css|.*\\.png|.*\\.jpg|.*\\.json).*)',
        destination: '/index.html',
      },
    ]);
    expect(JSON.stringify(config.rewrites)).not.toContain('[token].html');
  });
});
