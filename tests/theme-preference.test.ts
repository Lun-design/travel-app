import { beforeEach, describe, expect, it } from 'vitest';
import { loadThemeMode, saveThemeMode } from '../lib/theme-preference';

describe('theme preference persistence', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
    });
  });

  it('round-trips a supported mode through localStorage', async () => {
    await saveThemeMode('dark');
    expect(await loadThemeMode()).toBe('dark');
    await saveThemeMode('system');
    expect(await loadThemeMode()).toBe('system');
  });

  it('falls back to system for missing or invalid values', async () => {
    expect(await loadThemeMode()).toBe('system');
    await saveThemeMode('invalid' as never);
    expect(await loadThemeMode()).toBe('system');
  });
});
