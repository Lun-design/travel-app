import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Vercel dynamic Expo routes', () => {
  it('serves the Expo share document before falling back to the SPA entry', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual([
      { source: '/share/:token', destination: '/share/[token].html' },
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });
});
