import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Vercel dynamic Expo routes', () => {
  it('uses a single SPA fallback for every client-side route', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual([
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });
});
