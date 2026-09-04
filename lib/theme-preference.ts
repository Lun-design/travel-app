import type { ThemeMode } from './theme';

export const THEME_STORAGE_KEY = 'travel-planner.theme-mode';
const memoryStorage = new Map<string, string>();

function getLocalStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const storage = getLocalStorage();
  let value: string | null = null;
  try { value = storage?.getItem(THEME_STORAGE_KEY) ?? memoryStorage.get(THEME_STORAGE_KEY) ?? null; } catch { value = memoryStorage.get(THEME_STORAGE_KEY) ?? null; }
  return isThemeMode(value) ? value : 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  if (!isThemeMode(mode)) return;
  memoryStorage.set(THEME_STORAGE_KEY, mode);
  try { getLocalStorage()?.setItem(THEME_STORAGE_KEY, mode); } catch { /* private browsing or restricted storage */ }
}
