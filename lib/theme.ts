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

export const EDITORIAL_COLORS = {
  oat: '#F8F6F0',
  paper: '#FFFDF8',
  sand: '#F1EEE6',
  charcoal: '#1F1F1F',
  taupe: '#746F64',
  line: '#E5E2D9',
  terracotta: '#9A6A45',
  terracottaSoft: '#F1E4D8',
  amberSoft: '#F5EBDD',
  amberText: '#8A5A32',
  dangerSoft: '#F4E1DC',
  dangerText: '#944B3C',
} as const;

const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: EDITORIAL_COLORS.oat,
    surface: EDITORIAL_COLORS.paper,
    surfaceMuted: EDITORIAL_COLORS.sand,
    card: EDITORIAL_COLORS.paper,
    text: EDITORIAL_COLORS.charcoal,
    muted: EDITORIAL_COLORS.taupe,
    border: EDITORIAL_COLORS.line,
    primary: EDITORIAL_COLORS.terracotta,
    tabTrack: EDITORIAL_COLORS.sand,
    warningSurface: EDITORIAL_COLORS.amberSoft,
    warningText: EDITORIAL_COLORS.amberText,
  },
};

const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: EDITORIAL_COLORS.charcoal,
    surface: '#292824',
    surfaceMuted: '#35322C',
    card: '#292824',
    text: EDITORIAL_COLORS.oat,
    muted: '#C8C1B5',
    border: '#514C43',
    primary: '#D5A77A',
    tabTrack: '#35322C',
    warningSurface: '#4A382A',
    warningText: '#E6B98D',
  },
};

export function getAppTheme(scheme: string | null | undefined): AppTheme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export function getThemeForMode(mode: ThemeMode, systemScheme: string | null | undefined): AppTheme {
  return getAppTheme(mode === 'system' ? systemScheme : mode);
}
