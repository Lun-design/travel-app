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

  it('keeps the segmented control from shrinking when child panels change', () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');
    const packing = readFileSync(projectFile('src', 'components', 'PackingPanel.tsx'), 'utf8');

    expect(detail).toMatch(/tabScroller: \{[^}]*minHeight: 44[^}]*height: 44[^}]*flexShrink: 0/);
    expect(detail).toMatch(/tabs: \{[^}]*minHeight: 44[^}]*height: 44[^}]*flexShrink: 0/);
    expect(packing).toMatch(/container: \{[^}]*width: '100%'[^}]*maxWidth: '100%'[^}]*minHeight: 0/);
    expect(packing).not.toContain('position: \'absolute\'');
  });

  it('connects map markers to timeline focus and provides a directions URL', async () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');
    const webMap = readFileSync(projectFile('src', 'components', 'TripMap.web.tsx'), 'utf8');
    const nativeMap = readFileSync(projectFile('src', 'components', 'TripMap.native.tsx'), 'utf8');
    const timeline = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');
    const { getGoogleMapsDirectionsUrl } = await import('../lib/map-links');

    expect(getGoogleMapsDirectionsUrl(25.033, 121.565)).toBe('https://www.google.com/maps/dir/?api=1&destination=25.033%2C121.565&travelmode=driving');
    expect(getGoogleMapsDirectionsUrl(null, 121.565)).toBeNull();
    expect(detail).toContain('onMarkerPress={handleMapMarkerPress}');
    expect(detail).toContain('focusedItemId={focusedItemId}');
    expect(webMap).toContain('trip-map-marker-press');
    expect(nativeMap).toContain('onPress={() => onMarkerPress?.(marker.id)}');
    expect(timeline).toContain('getGoogleMapsDirectionsUrl');
    expect(timeline).toContain('🧭 開啟 Google Maps 導航');
  });

  it('lays out the trip header as title and metadata rows with safe-area padding', () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');

    expect(detail).toContain("import { useSafeAreaInsets } from 'react-native-safe-area-context';");
    expect(detail).toContain('const insets = useSafeAreaInsets();');
    expect(detail).toContain('styles.headerTitleRow');
    expect(detail).toContain('styles.headerMetaRow');
    expect(detail).toContain('paddingTop: insets.top');
    expect(detail).toContain('paddingBottom: 22 + insets.bottom');
    expect(detail).toContain('bottom: layout.fabBottom + insets.bottom');
  });

  it('shows an offline cache indicator and a tab overflow hint', () => {
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');

    expect(detail).toContain('navigator.onLine');
    expect(detail).toContain('offlineBar');
    expect(detail).toContain('📡 離線模式：已載入快取行程');
    expect(detail).toContain('styles.tabShell');
    expect(detail).toContain('styles.tabScrollHint');
    expect(detail).toContain('pointerEvents="none"');
  });

  it('offers accessible up and down controls for timeline cards', () => {
    const shared = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');
    const web = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.web.tsx'), 'utf8');
    const native = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.native.tsx'), 'utf8');

    expect(shared).toContain('▲ 上移');
    expect(shared).toContain('▼ 下移');
    expect(shared).toContain('onMoveUp');
    expect(shared).toContain('onMoveDown');
    expect(web).toContain('async function moveItem');
    expect(web).toContain('reorderItineraryItems');
    expect(native).toContain('async function moveItem');
    expect(native).toContain('reorderItineraryItems');
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

    expect(packing).toMatch(/container: \{[^}]*width: '100%'[^}]*maxWidth: '100%'[^}]*boxSizing: 'border-box'/);
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
