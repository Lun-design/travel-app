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

  it('defaults the map closed on narrow screens and open on desktop', async () => {
    const { getDefaultMapOpen } = await import('../lib/trip-detail-layout');

    expect(getDefaultMapOpen(375)).toBe(false);
    expect(getDefaultMapOpen(479)).toBe(false);
    expect(getDefaultMapOpen(480)).toBe(true);
    expect(getDefaultMapOpen(1024)).toBe(true);
  });

  it('keeps tabs content-sized and horizontally scrollable', () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');

    expect(detail).toContain('<ScrollView horizontal showsHorizontalScrollIndicator={false}');
    expect(detail).not.toContain('minWidth: 136');
    expect(detail).not.toContain("tab: { minWidth: 130, flex: 1");
    expect(detail).toContain('contentContainerStyle={styles.tabs}');
    expect(detail).toContain('paddingLeft: 12');
    expect(detail).toContain("container: { flex: 1, width: '100%', maxWidth: '100%', overflow: 'hidden'");
  });

  it('renders the map as a flow card controlled by an explicit toggle', () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');

    expect(detail).toContain('const [isMapOpen, setIsMapOpen] = useState(() => getDefaultMapOpen(width));');
    expect(detail).toContain('🗺️ 查看地圖路線 (點擊展開)');
    expect(detail).toContain('🗺️ 隱藏地圖');
    expect(detail).toContain('onPress={() => setIsMapOpen((current) => !current)}');
    expect(detail).toContain('{isMapOpen && <View style={[styles.mapPane');
    expect(detail).toContain("mapPane: { width: '100%', maxWidth: '100%', minWidth: 0");
  });

  it('keeps expense amounts inside full-width cards', () => {
    const expenseList = readFileSync(projectFile('src', 'components', 'ExpenseList.tsx'), 'utf8');
    const settlement = readFileSync(projectFile('src', 'components', 'SettlementCard.tsx'), 'utf8');

    expect(expenseList).toContain("card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box'");
    expect(expenseList).toContain('details: { flex: 1, minWidth: 0 }');
    expect(expenseList).toContain("amount: { color: '#0f172a', fontSize: 13, fontWeight: '800', flexShrink: 0");
    expect(settlement).toContain("card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box'");
    expect(settlement).toContain('settlementText: { flex: 1, minWidth: 0');
  });

  it('wraps packing progress and template controls on narrow screens', () => {
    const packing = readFileSync(projectFile('src', 'components', 'PackingPanel.tsx'), 'utf8');

    expect(packing).toContain("container: { width: '100%', maxWidth: '100%', boxSizing: 'border-box'");
    expect(packing).toContain("progressCard: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box'");
    expect(packing).toContain("progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap'");
    expect(packing).toContain("templates: { flexDirection: 'row', flexWrap: 'wrap'");
    expect(packing).not.toContain('contentContainerStyle={styles.templates}');
  });

  it('constrains voucher and document cards to the viewport', () => {
    const vouchers = readFileSync(projectFile('src', 'components', 'VouchersPanel.tsx'), 'utf8');
    const documents = readFileSync(projectFile('src', 'components', 'DocumentsPanel.tsx'), 'utf8');

    for (const source of [vouchers, documents]) {
      expect(source).toContain("container: { width: '100%', maxWidth: '100%', boxSizing: 'border-box'");
      expect(source).toContain("card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box'");
      expect(source).toContain('headerCopy: { flex: 1, minWidth: 0 }');
      expect(source).toContain('content: { flex: 1, minWidth: 0 }');
    }
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
