import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildTimeOptions, normalizeDateValue, normalizeTimeValue, openNativePicker, openTimePicker } from '../lib/form-pickers';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('time and date picker fields', () => {
  it('normalizes manually supplied clock values to HH:mm', () => {
    expect(normalizeTimeValue('9:05')).toBe('09:05');
    expect(normalizeTimeValue('0905')).toBe('09:05');
    expect(normalizeTimeValue('24:00')).toBe('');
    expect(normalizeTimeValue('')).toBe('');
  });

  it('opens the native time picker when the field itself is clicked', () => {
    const showPicker = vi.fn();
    const focus = vi.fn();
    openTimePicker({ showPicker, focus } as unknown as HTMLInputElement);
    expect(showPicker).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the time field when showPicker is unavailable or blocked', () => {
    const fallbackInput = { focus: vi.fn() } as unknown as HTMLInputElement;
    openTimePicker(fallbackInput);
    expect(fallbackInput.focus).toHaveBeenCalledOnce();

    const blockedInput = {
      showPicker: vi.fn(() => { throw new DOMException('not allowed'); }),
      focus: vi.fn(),
    } as unknown as HTMLInputElement;
    openTimePicker(blockedInput);
    expect(blockedInput.focus).toHaveBeenCalledOnce();
  });

  it('opens the date picker from anywhere in the date field', () => {
    const showPicker = vi.fn();
    openNativePicker({ showPicker, focus: vi.fn() } as unknown as HTMLInputElement);
    expect(showPicker).toHaveBeenCalledOnce();
    const pickers = source('src/components/FormPickers.tsx');
    const openOnFieldClick = 'onClick={(event) => openNativePicker(event.currentTarget)}';
    expect(pickers.split(openOnFieldClick).length - 1).toBe(2);
  });

  it('offers a 15-minute native picker interval', () => {
    const options = buildTimeOptions(15);
    expect(options).toContain('00:00');
    expect(options).toContain('09:00');
    expect(options).toContain('23:45');
    expect(options).toHaveLength(96);
  });

  it('accepts only an ISO date value for date controls', () => {
    expect(normalizeDateValue('2026-10-23')).toBe('2026-10-23');
    expect(normalizeDateValue('2026/10/23')).toBe('');
    expect(normalizeDateValue('')).toBe('');
  });

  it('wires the itinerary editor start time to a picker callback', () => {
    const modal = source('src/components/ItineraryItemModal.tsx');
    const pickers = source('src/components/FormPickers.tsx');
    expect(modal).toContain('<TimePickerField');
    expect(modal).toContain('value={time}');
    expect(modal).toContain('onChange={setTime}');
    expect(pickers).toContain('onClick={(event) => openNativePicker(event.currentTarget)}');
  });

  it('uses date and time pickers for trip-level settings and creation', () => {
    const settings = source('src/components/TripSettingsModal.tsx');
    const create = source('src/components/CreateTripModal.tsx');
    const places = source('src/components/TripPlacesPanel.tsx');
    expect(settings).toContain('<DatePickerField');
    expect(settings).toContain('<TimePickerField');
    expect(create).toContain('<DatePickerField');
    expect(create).toContain('<TimePickerField');
    expect(places).toContain('<TimePickerField');
  });
});
