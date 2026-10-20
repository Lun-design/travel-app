import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
import type { Trip } from '../lib/trips';
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useRef: (v: unknown) => a.default.useRef(v) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', Modal: 'modal', ScrollView: 'section', Platform: { OS: 'web' }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/timezone', async () => import('../lib/timezone'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/trip-dates', async () => import('../lib/trip-dates'));
vi.mock('../src/components/FormPickers', () => ({ DatePickerField: 'date-picker', TimePickerField: 'time-picker' }));
import { TripSettingsModal } from '../src/components/TripSettingsModal';
import { CreateTripModal } from '../src/components/CreateTripModal';
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; });
function field(tree: React.ReactNode) { return nodes(tree).find(n => typeof n.type === 'function' && n.type.name === 'TimezonePickerField'); }
function button(tree: React.ReactNode, title: string) { return nodes(tree).find(n => n.type === 'button' && text(n) === title)!; }
function changeZone(tree: React.ReactNode, value: string) {
  expect(field(tree), 'uses the shared timezone region picker').toBeDefined();
  (field(tree)!.props.onChange as (v: string) => void)(value);
}
const trip = { id: 't', title: '旅行', destination: '日本', start_date: '2026-12-01', end_date: '2026-12-03', default_departure_time: '08:17', timezone: 'Australia/Adelaide' } as Trip;
describe('timezone modal integration', () => {
  it('updates only the settings timezone and preserves exact dates and departure time', async () => {
    const save = vi.fn(), close = vi.fn();
    const h = harness(() => TripSettingsModal({ visible: true, startDate: trip.start_date, endDate: trip.end_date, departureTime: trip.default_departure_time, timezone: trip.timezone, onSave: save, onClose: close })); cleanup = h.unmount; h.render();
    changeZone(h.render(), 'Asia/Tokyo'); await button(h.render(), '儲存設定').props.onPress!();
    expect(save).toHaveBeenCalledWith({ start_date: trip.start_date, end_date: trip.end_date, default_departure_time: '08:17', timezone: 'Asia/Tokyo' });
    expect(close).toHaveBeenCalledOnce();
  });
  it('preserves an existing custom timezone when editing and does not infer on destination typing', async () => {
    const update = vi.fn();
    const h = harness(() => CreateTripModal({ visible: true, userId: 'u', initialTrip: trip, onUpdate: update, onClose: vi.fn() })); cleanup = h.unmount; h.render();
    expect(field(h.render())?.props.value).toBe('Australia/Adelaide');
    nodes(h.render()).find(n => n.props.placeholder === '目的地')!.props.onChangeText!('美國 洛杉磯');
    expect(field(h.render())?.props.value).toBe('Australia/Adelaide');
    await button(h.render(), '儲存變更').props.onPress!();
    expect(update).toHaveBeenCalledWith('t', expect.objectContaining({ timezone: 'Australia/Adelaide', destination: '美國 洛杉磯', default_departure_time: '08:17' }));
  });
  it('passes the selected region on creation, and cancel never writes', async () => {
    const create = vi.fn(), close = vi.fn();
    const h = harness(() => CreateTripModal({ visible: true, userId: 'u', onCreate: create, onClose: close })); cleanup = h.unmount; h.render();
    nodes(h.render()).find(n => n.props.placeholder === '行程名稱')!.props.onChangeText!('首爾');
    nodes(h.render()).find(n => n.props.placeholder === '目的地')!.props.onChangeText!('韓國');
    const dates = nodes(h.render()).filter(n => n.type === 'date-picker');
    (dates[0].props.onChange as (v: string) => void)('2026-12-01'); (dates[1].props.onChange as (v: string) => void)('2026-12-03');
    changeZone(h.render(), 'Asia/Seoul'); button(h.render(), '取消').props.onPress!();
    expect(create).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    button(h.render(), '繼續編輯').props.onPress!();
    await button(h.render(), '建立行程').props.onPress!();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Asia/Seoul', created_by: 'u', default_departure_time: null }));
  });
  it('rejects invalid advanced timezones without saving or closing', async () => {
    const save = vi.fn(), close = vi.fn();
    const h = harness(() => TripSettingsModal({ visible: true, startDate: trip.start_date, endDate: trip.end_date, departureTime: '', timezone: trip.timezone, onSave: save, onClose: close })); cleanup = h.unmount; h.render();
    changeZone(h.render(), 'bad/zone'); await button(h.render(), '儲存設定').props.onPress!();
    expect(save).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(text(h.render())).toContain('有效的 IANA');
  });
});
