export const PUPPY_IDS = ['-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', '-11'] as const;
export type PuppyId = (typeof PUPPY_IDS)[number];
// Journal decorations are not profile-avatar choices.
export type PuppyArtId = PuppyId | 'journal-together' | 'journal-reading' | 'journal-drive' | 'journal-dance' | 'journal-comfort' | 'journal-hearts';

export function getNavigationPuppy(category: string, mode = 'DRIVING'): PuppyArtId {
  const key = category.trim().toLowerCase();
  if (key === 'spot' || key === 'transit' || key === 'transport') {
    if (mode === 'DRIVING' || mode === 'DRIVE') return 'journal-drive';
    return mode === 'WALKING' ? '-11' : '-8';
  }
  const categoryPuppies: Record<string, PuppyId> = {
    flight: '-8', hotel: '-6', food: '-10', restaurant: '-10',
    spot: '-11', outdoor: '-9', trail: '-7',
  };
  return Object.prototype.hasOwnProperty.call(categoryPuppies, key) ? categoryPuppies[key] : '-8';
}

export function isPuppyId(value: string): value is PuppyId {
  return (PUPPY_IDS as readonly string[]).includes(value);
}
