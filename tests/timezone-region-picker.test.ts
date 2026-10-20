import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import { isValidTimezone, toZonedDateTimeParts } from '../lib/timezone';
import { TIMEZONE_REGIONS, detectTravelTimezone } from '../lib/timezone-options';
const platform = vi.hoisted(() => ({ OS: 'web' }));
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', ScrollView: 'section', Platform: platform, StyleSheet: { create: (v: unknown) => v } }));
import { TimezonePickerField } from '../src/components/TimezonePickerField';
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; platform.OS = 'web'; });
describe('timezone region data', () => {
  it('uses unique valid IANA values and clear Chinese regional labels', () => {
    expect(new Set(TIMEZONE_REGIONS.map(r => r.value)).size).toBe(TIMEZONE_REGIONS.length);
    expect(TIMEZONE_REGIONS.every(r => isValidTimezone(r.value))).toBe(true);
    for (const [label, zone] of [['台灣', 'Asia/Taipei'], ['日本', 'Asia/Tokyo'], ['韓國', 'Asia/Seoul'], ['紐約', 'America/New_York'], ['洛杉磯', 'America/Los_Angeles']]) {
      expect(TIMEZONE_REGIONS.find(r => r.value === zone)?.label).toContain(label);
    }
  });
  it('detects explicit cities before country words without guessing ambiguous destinations', () => {
    expect(detectTravelTimezone('美國 洛杉磯')).toBe('America/Los_Angeles');
    expect(detectTravelTimezone('New York, USA')).toBe('America/New_York');
    expect(detectTravelTimezone('大阪 日本JP')).toBe('Asia/Tokyo');
    expect(detectTravelTimezone('台灣台北')).toBe('Asia/Taipei');
    for (const value of ['', '美國', 'Australia', 'unknown', 'Japan / Seoul']) expect(detectTravelTimezone(value)).toBeNull();
  });
  it('keeps daylight-saving behavior in IANA rules, not fixed offsets', () => {
    expect(toZonedDateTimeParts(new Date('2026-01-01T12:00:00Z'), 'America/New_York').time).toBe('07:00');
    expect(toZonedDateTimeParts(new Date('2026-07-01T12:00:00Z'), 'America/New_York').time).toBe('08:00');
  });
  it('does not mistake same-name cities in another country for a preset region', () => {
    for (const value of ['加拿大 London', '美國 巴黎', '加拿大 Sydney', 'London, Canada', 'Paris, Texas, USA']) expect(detectTravelTimezone(value)).toBeNull();
    expect(detectTravelTimezone('London, UK')).toBe('Europe/London');
    expect(detectTravelTimezone('Paris, France')).toBe('Europe/Paris');
    expect(detectTravelTimezone('Tokyo, Japan')).toBe('Asia/Tokyo');
  });
});
describe('timezone picker interaction', () => {
  function setup(initial = 'Asia/Taipei', destination?: string, disabled = false) {
    let value = initial; const change = vi.fn((v: string) => { value = v; });
    const h = harness(() => TimezonePickerField({ value, onChange: change, destination, disabled })); cleanup = h.unmount; h.render();
    return { ...h, change };
  }
  const select = (tree: React.ReactNode) => nodes(tree).find(n => n.type === 'select')!;
  function choose(tree: React.ReactNode, value: string) { (select(tree).props.onChange as (e: unknown) => void)({ currentTarget: { value } }); }
  it('selects a region and emits its IANA value', () => {
    const h = setup(); choose(h.render(), 'Asia/Seoul');
    expect(h.change).toHaveBeenCalledWith('Asia/Seoul'); expect(select(h.render()).props.value).toBe('Asia/Seoul');
  });
  it('opens advanced mode without overwriting an existing or selected value', () => {
    const h = setup(); choose(h.render(), '__custom__'); expect(h.change).not.toHaveBeenCalled();
    const input = nodes(h.render()).find(n => n.props.accessibilityLabel === '自訂 IANA 時區')!;
    expect(input.props.value).toBe('Asia/Taipei'); input.props.onChangeText!('Australia/Adelaide');
    expect(h.change).toHaveBeenCalledWith('Australia/Adelaide');
    expect(select(h.render()).props.value).toBe('__custom__');
  });
  it('shows existing non-preset IANA values without normalizing them away', () => {
    const h = setup('Pacific/Chatham');
    expect(select(h.render()).props.value).toBe('__custom__');
    expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '自訂 IANA 時區')!.props.value).toBe('Pacific/Chatham');
    expect(h.change).not.toHaveBeenCalled();
  });
  it('only infers on a deliberate click and preserves the value for ambiguous countries', () => {
    const h = setup('Asia/Taipei', '美國'); expect(h.change).not.toHaveBeenCalled();
    press(h.render(), '依目的地判定時區'); expect(h.change).not.toHaveBeenCalled(); expect(text(h.render())).toContain('選擇城市');
  });
  it('supports manual destination inference without touching any other form field', () => {
    const h = setup('Asia/Taipei', '美國 洛杉磯'); press(h.render(), '依目的地判定時區');
    expect(h.change).toHaveBeenCalledOnce(); expect(h.change).toHaveBeenCalledWith('America/Los_Angeles');
  });
  it('offers native selectable rows without mounting another modal', () => {
    platform.OS = 'ios'; const h = setup(); press(h.render(), '目的地時區');
    press(h.render(), '時區：日本／東京');
    expect(h.change).toHaveBeenCalledWith('Asia/Tokyo'); expect(nodes(h.render()).some(n => n.type === 'modal')).toBe(false);
  });
  it('lets the first native option tap select while the advanced keyboard is open', () => {
    platform.OS = 'ios'; const h = setup('Pacific/Chatham'); press(h.render(), '目的地時區');
    expect(nodes(h.render()).find(n => n.type === 'section')!.props.keyboardShouldPersistTaps).toBe('handled');
  });
  it('disables both selection and manual inference while a form is saving', () => {
    const h = setup('Asia/Taipei', '日本', true);
    expect(select(h.render()).props.disabled).toBe(true);
    expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '依目的地判定時區')!.props.disabled).toBe(true);
    choose(h.render(), 'Asia/Tokyo'); expect(h.change).not.toHaveBeenCalled();
  });
});
