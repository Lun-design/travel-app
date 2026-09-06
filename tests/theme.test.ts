import { describe, expect, it } from 'vitest';
import { getAppTheme, getThemeForMode } from '../lib/theme';

describe('app theme', () => {
  it('exposes readable light and dark palettes', () => {
    const light = getAppTheme('light');
    const dark = getAppTheme('dark');

    expect(light.isDark).toBe(false);
    expect(dark.isDark).toBe(true);
    expect(light.colors.background).not.toBe(dark.colors.background);
    expect(light.colors.background).toBe('#F8F6F0');
    expect(light.colors.text).toBe('#1F1F1F');
    expect(light.colors.primary).toBe('#9A6A45');
    expect(dark.colors.text).toBe('#F8F6F0');
    expect(dark.colors.surface).toBe('#292824');
    expect(dark.colors.primary).toBe('#D5A77A');
    expect(getThemeForMode('light', 'dark').isDark).toBe(false);
    expect(getThemeForMode('dark', 'light').isDark).toBe(true);
    expect(getThemeForMode('system', 'dark').isDark).toBe(true);
  });
});
