import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Vercel dynamic Expo routes', () => {
  it('routes dynamic pages to the SPA root without bracketed static destinations', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual([
      { source: '/(.*)', destination: '/' },
    ]);
    expect(JSON.stringify(config.rewrites)).not.toContain('.html');
  });

  it('uses Expo single output because share tokens are not known at build time', () => {
    const appConfig = JSON.parse(readFileSync('app.json', 'utf8')) as { expo?: { web?: { output?: string } } };
    expect(appConfig.expo?.web?.output).toBe('single');
  });
});
