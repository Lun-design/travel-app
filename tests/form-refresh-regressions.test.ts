import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
import type { Profile } from '../lib/profiles';
const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), weather: vi.fn(), pick: vi.fn(), upload: vi.fn(), save: vi.fn(), alert: vi.fn() }));
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Modal: 'dialog', ScrollView: 'section', Pressable: 'button', Image: 'img', Alert: { alert: mocks.alert }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.pick }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/profiles', async () => ({ ...await import('../lib/profiles'), updateCurrentProfile: mocks.save, uploadProfileAvatar: mocks.upload }));
vi.mock('@/lib/packing-api', () => ({ listPackingItems: mocks.list, updatePackingItem: mocks.update, createPackingItem: vi.fn(), deletePackingItem: vi.fn(), importPackingTemplate: vi.fn() }));
vi.mock('@/lib/weather-api', () => ({ fetchWeatherForecast: mocks.weather }));
vi.mock('@/lib/packing-utils', async () => import('../lib/packing-utils'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/offline-store', () => ({ offlineStore: {} }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
import { UserProfileModal } from '../src/components/UserProfileModal';
import { PackingPanel } from '../src/components/PackingPanel';
const oldProfile: Profile = { id: 'u', display_name: '旅伴', avatar_url: 'https://example.test/old.jpg', updated_at: '2026-10-18T00:00:00Z' };
beforeEach(() => {
  mocks.pick.mockResolvedValue({ canceled: false, assets: [{ name: 'new.png', uri: 'blob:new', mimeType: 'image/png' }] });
  vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1) })));
  mocks.upload.mockResolvedValue('https://example.test/new.png');
  mocks.save.mockImplementation(async (p) => ({ ...oldProfile, ...p }));
  mocks.weather.mockResolvedValue({ precipitationProbability: 0 }); mocks.update.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
function click(tree: React.ReactNode, label: string) {
  const button = nodes(tree).find((node) => node.type === 'button' && node.props.onPress && text(node).includes(label));
  if (!button || button.props.disabled) throw new Error(`Unavailable: ${label}`);
  return button.props.onPress!();
}
describe('background refresh must not undo an active interaction', () => {
  it('keeps a selected avatar and edited name when focus reload replaces the same user profile object', async () => {
    let profile = oldProfile;
    const saved = vi.fn();
    const h = harness(() => UserProfileModal({ visible: true, profile, onClose: vi.fn(), onSaved: saved })); h.render();
    try {
      nodes(h.render()).find((node) => node.type === 'input')!.props.onChangeText!('新暱稱');
      click(h.render(), '上傳自己的圖片');
      await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.size === 92)?.props.profile).toMatchObject({ avatar_url: 'blob:new' }));
      profile = { ...oldProfile }; h.render();
      expect(nodes(h.render()).find((n) => n.props.size === 92)?.props.profile).toMatchObject({ avatar_url: 'blob:new', display_name: '新暱稱' });
      await click(h.render(), '儲存個人檔案');
      await vi.waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: 'https://example.test/new.png', display_name: '新暱稱' })));
    } finally { h.unmount(); }
  });
  it('does not roll back a checked item when an earlier weather-assisted load finishes late', async () => {
    const item = { id: 'p', trip_id: 't', name: '護照', category: '證件', is_checked: false, is_packed: false };
    mocks.list.mockResolvedValue([item]);
    let refreshToken = 0;
    const itinerary = [{ id: 'i', latitude: 34, longitude: 135 }] as Parameters<typeof PackingPanel>[0]['items'];
    const h = harness(() => PackingPanel({ tripId: 't', userId: 'u', members: [], items: itinerary, tripStartDate: '2026-10-23', refreshToken }));
    h.render();
    const checkbox = () => nodes(h.render()).find((n) => n.type === 'button' && Array.isArray(n.props.style) && n.props.onPress && ['', '✓'].includes(text(n)))!;
    try {
      await vi.waitFor(() => expect(text(h.render())).toContain('護照'));
      let resolveWeather!: (value: unknown) => void;
      mocks.weather.mockImplementationOnce(() => new Promise((resolve) => { resolveWeather = resolve; }));
      refreshToken++; h.render();
      await vi.waitFor(() => expect(mocks.weather).toHaveBeenCalledTimes(2));
      checkbox().props.onPress!();
      await vi.waitFor(() => { expect(mocks.update).toHaveBeenCalledOnce(); expect(checkbox().props.disabled).toBe(false); });
      expect(text(checkbox())).toBe('✓');
      resolveWeather({ precipitationProbability: 0 }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(text(checkbox())).toBe('✓');
    } finally { h.unmount(); }
  });
  it('ignores a finishing packing mutation from a previous trip', async () => {
    let tripId = 't';
    const old = { id: 'p', trip_id: 't', name: '舊行程護照', category: '證件', is_checked: false };
    const next = { ...old, id: 'q', trip_id: 'next', name: '新行程護照' };
    mocks.list.mockImplementation(async (id) => id === 't' ? [old] : [next]);
    let finish!: () => void;
    mocks.update.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const h = harness(() => PackingPanel({ tripId, userId: 'u', members: [] })); h.render();
    try {
      await vi.waitFor(() => expect(text(h.render())).toContain('舊行程護照'));
      nodes(h.render()).find((n) => n.type === 'button' && Array.isArray(n.props.style) && n.props.onPress && text(n) === '')!.props.onPress!();
      tripId = 'next'; h.render();
      finish(); await Promise.resolve(); await Promise.resolve();
      await vi.waitFor(() => expect(text(h.render())).toContain('新行程護照'));
      expect(text(h.render())).not.toContain('舊行程護照');
    } finally { h.unmount(); }
  });
});
