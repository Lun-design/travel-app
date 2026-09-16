/**
 * Shared visual tokens for the compact itinerary experience.
 * Keeping these values in one place prevents category badges from drifting
 * between native and web renderers.
 */
// Re-export the accent from the theme module so native and web entry points
// cannot accidentally drift to different active-state colors.
export { MOBILE_ACCENT_COFFEE } from './theme';

export type CategoryBadgePalette = Readonly<{
  backgroundColor: string;
  color: string;
  borderColor: string;
}>;

const SKY_BADGE: CategoryBadgePalette = {
  backgroundColor: '#F0F9FF',
  color: '#0369A1',
  borderColor: '#BAE6FD',
};

const EMERALD_BADGE: CategoryBadgePalette = {
  backgroundColor: '#ECFDF5',
  color: '#047857',
  borderColor: '#A7F3D0',
};

const PURPLE_BADGE: CategoryBadgePalette = {
  backgroundColor: '#FAF5FF',
  color: '#7E22CE',
  borderColor: '#E9D5FF',
};

const AMBER_BADGE: CategoryBadgePalette = {
  backgroundColor: '#FFFBEB',
  color: '#B45309',
  borderColor: '#FDE68A',
};

const NEUTRAL_BADGE: CategoryBadgePalette = {
  backgroundColor: '#F8FAFC',
  color: '#475569',
  borderColor: '#E2E8F0',
};

/** Return the pastel badge colors used for an itinerary category. */
export function getCategoryBadgePalette(category?: string | null): CategoryBadgePalette {
  switch ((category ?? '').trim().toLowerCase()) {
    case 'flight':
    case 'transit':
      return SKY_BADGE;
    case 'spot':
    case 'outdoor':
    case 'trail':
      return EMERALD_BADGE;
    case 'hotel':
      return PURPLE_BADGE;
    case 'food':
    case 'restaurant':
      return AMBER_BADGE;
    default:
      return NEUTRAL_BADGE;
  }
}
