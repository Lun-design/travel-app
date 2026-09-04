import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectFile = (...parts: string[]) => path.resolve(process.cwd(), ...parts);

describe('trip detail responsive layout', () => {
  it('uses compact spacing for a 375px viewport', async () => {
    const modulePath = projectFile('lib', 'trip-detail-layout.ts');
    expect(existsSync(modulePath)).toBe(true);

    const { getTripDetailLayout } = await import('../lib/trip-detail-layout');
    expect(getTripDetailLayout(375)).toEqual({
      compact: true,
      screenPaddingHorizontal: 12,
      screenPaddingTop: 18,
      panePadding: 12,
      mapMinHeight: 240,
      fabRight: 12,
      fabBottom: 12,
      fabPaddingHorizontal: 12,
      fabPaddingVertical: 10,
      fabFontSize: 13,
      fabMaxWidth: 351,
    });
  });

  it('keeps the roomy desktop spacing above the compact breakpoint', async () => {
    const { getTripDetailLayout } = await import('../lib/trip-detail-layout');
    expect(getTripDetailLayout(800)).toMatchObject({
      compact: false,
      screenPaddingHorizontal: 22,
      screenPaddingTop: 30,
      mapMinHeight: 280,
      fabRight: 34,
      fabBottom: 24,
      fabFontSize: 14,
    });
  });

  it('keeps tabs content-sized and horizontally scrollable', () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');

    expect(detail).toContain('<ScrollView horizontal showsHorizontalScrollIndicator={false}');
    expect(detail).not.toContain('minWidth: 136');
    expect(detail).not.toContain("tab: { minWidth: 130, flex: 1");
    expect(detail).toContain('contentContainerStyle={styles.tabs}');
  });

  it('pins Leaflet zoom controls to the top-left safe area', () => {
    const map = readFileSync(projectFile('src', 'components', 'TripMap.web.tsx'), 'utf8');

    expect(map).toContain("L.map('map', { zoomControl: false })");
    expect(map).toContain("L.control.zoom({ position: 'topleft' }).addTo(map)");
    expect(map).toContain('.leaflet-top.leaflet-left { top: 12px; left: 12px; }');
    expect(map).toContain('paddingBottomRight: compactMap ? [170, 78] : [48, 48]');
    expect(map).toContain('getTripDetailLayout(width)');
    expect(map).not.toContain('minHeight: 320');
  });
});
