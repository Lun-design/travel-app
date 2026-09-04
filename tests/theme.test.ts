import { describe, expect, it } from 'vitest';
import { getAppTheme } from '../lib/theme';

describe('app theme', () => {
  it('exposes readable light and dark palettes', () => {
    const light = getAppTheme('light');
    const dark = getAppTheme('dark');

    expect(light.isDark).toBe(false);
    expect(dark.isDark).toBe(true);
    expect(light.colors.background).not.toBe(dark.colors.background);
    expect(dark.colors.text).toBe('#f8fafc');
    expect(dark.colors.surface).toBe('#1e293b');
  });
});
