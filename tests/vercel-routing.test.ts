import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Vercel dynamic Expo routes', () => {
  it('rewrites share and trip dynamic paths to their static Expo route documents', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: '/share/:token', destination: '/share/[token].html' },
      { source: '/trips/:id', destination: '/trips/[id].html' },
    ]));
  });
});
