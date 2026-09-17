import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCategoryIcon } from '../lib/category-icons';

describe('itinerary category badge icons', () => {
  it('maps supported category keys to a visible glyph', () => {
    expect(getCategoryIcon('flight')).toBe('✈️');
    expect(getCategoryIcon('transit')).toBe('🚆');
    expect(getCategoryIcon('food')).toBe('🍴');
    expect(getCategoryIcon('restaurant')).toBe('🍴');
    expect(getCategoryIcon('hotel')).toBe('🏨');
    expect(getCategoryIcon('spot')).toBe('📍');
    expect(getCategoryIcon('trail')).toBe('🥾');
    expect(getCategoryIcon('outdoor')).toBe('🌿');
  });

  it('normalizes category keys and provides a fallback icon', () => {
    expect(getCategoryIcon('  HOTEL ')).toBe('🏨');
    expect(getCategoryIcon('unknown')).toBe('📌');
    expect(getCategoryIcon(null)).toBe('📌');
  });

  it('renders the icon before category text inside the badge', () => {
    const source = readFileSync('src/components/ItineraryTimeline.shared.tsx', 'utf8');
    const badge = source.slice(source.indexOf('function CategoryBadge'), source.indexOf('function formatDistance'));
    expect(badge).toContain('getCategoryIcon(category)');
    expect(badge).toContain('categoryBadgeIcon');
    expect(badge).toContain('{category}</Text>');
  });
});
