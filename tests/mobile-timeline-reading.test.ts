import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import { getAppTheme } from '../lib/theme';
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (v: unknown) => a.default.useState(v), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', ScrollView: 'section', useColorScheme: () => 'light', useWindowDimensions: () => ({ width: 390, height: 844 }), StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/timeline-metrics', async () => import('../lib/timeline-metrics'));
vi.mock('@/lib/trip-journal', async () => import('../lib/trip-journal'));
vi.mock('@/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
function merged(s: unknown): Record<string, unknown> { return Array.isArray(s) ? Object.assign({}, ...s.map(merged)) : s && typeof s === 'object' ? s as Record<string, unknown> : {}; }
function node(tree: React.ReactNode, id: string) { return nodes(tree).find(n => n.props.testID === id)!; }
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; });

describe('display-only duplicate notes', () => {
  it('does not merge meaningful word boundaries when comparing similar descriptions', async () => {
    const { getTimelineDisplayNotes } = await import('../lib/timeline-display');
    expect(getTimelineDisplayNotes({ title: 'Nowhere', notes: 'Now here!' })).toBe('Now here!');
    expect(getTimelineDisplayNotes({ title: '機場', notes: '機 場' })).toBe('機 場');
  });
  it.each([
    ['06:05 關西機場', null], ['06:05 | 關西機場。', null], ['關西機場', null],
    ['06:05 關西機場\n九點前離開機場', '九點前離開機場'],
    ['06:05 關西機場，九點前離開', '06:05 關西機場，九點前離開'],
    ['07:05 關西機場', '07:05 關西機場'], ['機場櫃檯 06:05 集合', '機場櫃檯 06:05 集合'],
    ['原始  格式\n  保留', '原始  格式\n  保留'], ['', null],
  ])('shows only nonredundant text from %j', async (notes, expected) => {
    expect(existsSync('lib/timeline-display.ts')).toBe(true);
    const { getTimelineDisplayNotes } = await import('../lib/timeline-display');
    const input = { title: '關西機場', time: '06:05', notes };
    expect(getTimelineDisplayNotes(input)).toBe(expected);
    expect(input.notes).toBe(notes);
  });
});

describe('mobile tools disclosure', () => {
  it('gives the inline optimization control enough vertical room including content padding', async () => {
    const { DashboardMetricsBar } = await import('../src/components/DashboardMetricsBar');
    const tree = DashboardMetricsBar({ dense: true, metrics: { spotCount: 10, stayMinutes: 0, transportMinutes: 166, estimatedCost: 0 }, action: React.createElement('button', { style: { minHeight: 34 } }, '最佳化') });
    const outer = merged(nodes(tree)[0].props.style), content = merged(nodes(tree)[0].props.contentContainerStyle);
    expect(Number(outer.height)).toBeGreaterThanOrEqual(34 + 2 * Number(content.paddingVertical));
  });
  it('keeps complete metrics in a single horizontally scrollable mobile row', async () => {
    const { DashboardMetricsBar } = await import('../src/components/DashboardMetricsBar');
    const tree = DashboardMetricsBar({ dense: true, metrics: { spotCount: 10, stayMinutes: 0, transportMinutes: 166, estimatedCost: 0 }, totalEstimatedCost: 7000, themeMode: 'light' });
    expect(nodes(tree)[0].type).toBe('section');
    expect(merged(nodes(tree)[0].props.contentContainerStyle).flexWrap).toBe('nowrap');
    expect(nodes(tree).some(n => String(n.props.label).includes('7,000'))).toBe(true);
  });
  it('keeps controls mounted but out of the initial mobile flow and reopens original callbacks', async () => {
    expect(existsSync('src/components/trip-detail/TimelineTools.tsx')).toBe(true);
    const { TimelineTools } = await import('../src/components/trip-detail/TimelineTools');
    const callback = vi.fn(); const child = React.createElement('button', { accessibilityLabel: '票券原入口', onPress: callback });
    let scopeKey = 'trip:1';
    const h = harness(() => TimelineTools({ compact: true, scopeKey, theme: getAppTheme('light'), children: child })); cleanup = h.unmount;
    let tree = h.render(); const body = node(tree, 'timeline-tools-body');
    expect(merged(body.props.style).display).toBe('none'); expect(body.props.accessibilityElementsHidden).toBe(true);
    expect(nodes(body)).toContain(child);
    press(tree, '展開旅程工具'); tree = h.render(); expect(merged(node(tree, 'timeline-tools-body').props.style).display).not.toBe('none');
    press(tree, '票券原入口'); expect(callback).toHaveBeenCalledOnce();
    press(tree, '收合旅程工具'); expect(nodes(node(h.render(), 'timeline-tools-body'))).toContain(child);
    press(h.render(), '展開旅程工具'); scopeKey = 'trip:2'; h.render();
    expect(merged(node(h.render(), 'timeline-tools-body').props.style).display).toBe('none');
  });
  it('does not hide desktop controls', async () => {
    expect(existsSync('src/components/trip-detail/TimelineTools.tsx')).toBe(true);
    const { TimelineTools } = await import('../src/components/trip-detail/TimelineTools');
    const h = harness(() => TimelineTools({ compact: false, scopeKey: 'trip:1', theme: getAppTheme('light'), children: '原工具' })); cleanup = h.unmount;
    expect(merged(node(h.render(), 'timeline-tools-body').props.style).display).not.toBe('none');
  });
});

describe('full-width mobile card details', () => {
  it.each([true, false])('keeps slots and actions once with compact=%s', async compact => {
    expect(existsSync('src/components/TimelineCardLayout.tsx')).toBe(true);
    const { TimelineCardLayout } = await import('../src/components/TimelineCardLayout');
    const onImage = vi.fn(), onNavigation = vi.fn();
    const image = React.createElement('button', { accessibilityLabel: '照片原入口', onPress: onImage });
    const heading = React.createElement('span', null, '標題');
    const details = React.createElement('button', { accessibilityLabel: '導航原入口', onPress: onNavigation });
    const tree = TimelineCardLayout({ compact, image, heading, details });
    expect(nodes(tree).filter(n => n === image)).toHaveLength(1); expect(nodes(tree).filter(n => n === details)).toHaveLength(1);
    if (compact) {
      expect(nodes(node(tree, 'timeline-card-heading'))).not.toContain(details);
      expect(nodes(node(tree, 'timeline-card-details'))).toContain(details);
      expect(merged(node(tree, 'timeline-card-details').props.style).width).toBe('100%');
    }
    press(tree, '照片原入口'); press(tree, '導航原入口'); expect(onImage).toHaveBeenCalledOnce(); expect(onNavigation).toHaveBeenCalledOnce();
  });
});

describe('transparent navigation puppy and smaller FAB', () => {
  it('uses genuinely transparent map-reading artwork, not the opaque category GIFs', async () => {
    expect(existsSync('src/components/NavigationPuppy.tsx')).toBe(true);
    const { NavigationPuppy } = await import('../src/components/NavigationPuppy');
    const tree = NavigationPuppy();
    expect(nodes(tree).find(n => n.type === 'mascot')?.props.puppy).toBe('journal-reading');
    expect(merged(node(tree, 'navigation-puppy-crop').props.style)).toMatchObject({ width: 28, height: 28, overflow: 'hidden' });
    expect(node(tree, 'navigation-puppy-crop').props.pointerEvents).toBe('none');
  });
  it.each([true, false])('preserves the add action with compact=%s', async compact => {
    expect(existsSync('src/components/trip-detail/TripAddButton.tsx')).toBe(true);
    const { TripAddButton } = await import('../src/components/trip-detail/TripAddButton');
    const onPress = vi.fn(); const tree = TripAddButton({ compact, onPress, textColor: '#fff' });
    press(tree, '新增景點／活動'); expect(onPress).toHaveBeenCalledOnce();
    expect(text(tree)).toBe(compact ? '＋' : '＋ 新增景點／活動');
    if (compact) expect(merged(nodes(tree)[0].props.style)).toMatchObject({ width: 48, height: 48, paddingHorizontal: 0 });
  });
  it('integrates helpers without removing the original map or bottom scroll clearance', () => {
    const source = readFileSync('src/components/ItineraryTimeline.shared.tsx', 'utf8');
    const panel = readFileSync('src/components/trip-detail/TimelinePanel.tsx', 'utf8');
    const route = readFileSync('src/app/trips/[id].tsx', 'utf8');
    expect(source.includes('<TimelineCardLayout')).toBe(true); expect(source.includes('<NavigationPuppy')).toBe(false);
    expect(source.includes('timelineMarkerPuppy ?')).toBe(true);
    expect(panel.includes('<TimelineTools')).toBe(true); expect(panel.includes('{isMapOpen &&')).toBe(true);
    expect(route.includes('<TripAddButton')).toBe(true); expect(route).toContain('paddingBottom: 144');
  });
});
