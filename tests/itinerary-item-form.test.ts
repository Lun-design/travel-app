import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSaveItineraryItem } from '../lib/itinerary';

describe('itinerary item form validation', () => {
  it('enables saving after a user manually enters a non-empty title', () => {
    expect(canSaveItineraryItem('  淺草寺  ')).toBe(true);
  });

  it('keeps saving disabled when the title is empty', () => {
    expect(canSaveItineraryItem('   ')).toBe(false);
    expect(canSaveItineraryItem(null)).toBe(false);
  });

  it('wires the title-only validation to the modal save button', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryItemModal.tsx'), 'utf8');
    expect(source).toContain('const titleValid = canSaveItineraryItem(name);');
    expect(source).toContain('disabled={!titleValid || saving}');
    expect(source).toContain('zIndex: 1000');
  });
});
