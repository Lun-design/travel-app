export type AppTheme = {
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceMuted: string;
    card: string;
    text: string;
    muted: string;
    border: string;
    primary: string;
    tabTrack: string;
    warningSurface: string;
    warningText: string;
  };
};
export type ThemeMode = 'light' | 'dark' | 'system';
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: '#f8fafc', surface: '#ffffff', surfaceMuted: '#f1f5f9', card: '#f8fafc',
    text: '#0f172a', muted: '#64748b', border: '#e2e8f0', primary: '#2563eb', tabTrack: '#e2e8f0',
    warningSurface: '#fef3c7', warningText: '#92400e',
  },
};

const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: '#0f172a', surface: '#1e293b', surfaceMuted: '#334155', card: '#1e293b',
    text: '#f8fafc', muted: '#cbd5e1', border: '#475569', primary: '#93c5fd', tabTrack: '#334155',
    warningSurface: '#422006', warningText: '#fde68a',
  },
};

export function getAppTheme(scheme: string | null | undefined): AppTheme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export function getThemeForMode(mode: ThemeMode, systemScheme: string | null | undefined): AppTheme {
  return getAppTheme(mode === 'system' ? systemScheme : mode);
}
