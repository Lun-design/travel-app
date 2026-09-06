import React from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
// Use installed Web rendering packages; the project does not ship their optional type packages.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (element: React.ReactElement) => string };
vi.mock('react-native', async () => {
  const { createRequire } = await import('node:module');
  return { View: createRequire(import.meta.url)('react-native-web').View };
});
import { TimelineViewport } from '../src/components/trip-detail/TimelineViewport';

describe('timeline viewport rendering', () => {
  it.each([[1440, 900], [1920, 1080], [1024, 600]])('renders all cards without a shrinking nested viewport at %sx%s', (width, height) => {
    const html = renderToStaticMarkup(React.createElement(TimelineViewport, { width, height, children: Array.from({ length: 20 }, (_, i) => React.createElement('article', { key: i }, `景點 ${i + 1}`)) }));
    expect(html).toContain('景點 20');
    expect(html).toContain('flex-shrink:0');
    expect(html).toContain(`min-height:${Math.max(320, height / 2)}px`);
    expect(html).toContain('padding-bottom:100px');
    expect(html).not.toContain('overflow:hidden');
  });
  it('lets mobile content determine height', () => {
    const html = renderToStaticMarkup(React.createElement(TimelineViewport, { width: 375, height: 667, children: React.createElement('article', null, '手機景點') }));
    expect(html).toContain('手機景點');
    expect(html).toContain('min-height:0px');
  });
});
