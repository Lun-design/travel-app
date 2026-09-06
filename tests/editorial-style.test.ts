import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('editorial visual system', () => {
  it('uses the warm oat palette for global entry surfaces', () => {
    const sources = [
      read('src/app/index.tsx'),
      read('src/app/login.tsx'),
      read('src/components/AuthGate.tsx'),
      read('src/components/SkeletonCard.tsx'),
      read('src/components/OfflineSyncBanner.tsx'),
    ].join('\n');

    expect(sources).toContain('EDITORIAL_COLORS.oat');
    expect(sources).toContain('EDITORIAL_COLORS.line');
    expect(sources).not.toContain('#2563eb');
    expect(sources).not.toContain('shadowRadius');
  });

  it('keeps web metadata aligned with the editorial theme', () => {
    expect(read('src/app/+html.tsx')).toContain('content="#9A6A45"');
    expect(read('app.json')).toContain('"themeColor": "#9A6A45"');
    expect(read('app.json')).toContain('"backgroundColor": "#F8F6F0"');
  });
});
