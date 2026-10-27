import type { AppTheme } from './theme';

/** Display-only tokens scoped to the itinerary journal, not other app forms. */
export function getTripJournalPalette(theme: AppTheme) {
  return theme.isDark ? {
    page: theme.colors.background, paper: theme.colors.surface,
    soft: theme.colors.surfaceMuted, ink: theme.colors.text,
    muted: theme.colors.muted, accent: theme.colors.primary, line: theme.colors.border,
    accentText: theme.colors.primary, mutedOnSoft: theme.colors.muted,
  } : {
    page: '#F7F3EB', paper: '#FFFDF8', soft: '#EEE3D5', ink: '#49392E',
    muted: '#7A6B5E', accent: '#8C6D58', line: '#E9E1D6',
    accentText: '#70523F', mutedOnSoft: '#746253',
  };
}
