import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as puppies from '../lib/puppy';
import { getAppTheme } from '../lib/theme';

describe('contextual puppy artwork', () => {
  it('keeps new decorative assets out of the existing avatar choices', () => {
    expect(puppies.PUPPY_IDS).toHaveLength(11);
    expect(puppies.isPuppyId('journal-together')).toBe(false);
    expect(puppies.isPuppyId('-1')).toBe(true);
  });
  it.each(['journal-together', 'journal-reading', 'journal-drive'])('ships the original transparent %s GIF and explicitly binds it', name => {
    const path = `src/assets/images/puppy/${name}.gif`;
    expect(existsSync(path), `${name} asset exists`).toBe(true);
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 3).toString()).toBe('GIF');
    let frames = 0, transparent = 0;
    for (let i = 0; i < bytes.length - 7; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4 && bytes[i + 7] === 0) {
        frames++; if (bytes[i + 3] & 1) transparent++;
      }
    }
    expect(frames).toBeGreaterThan(1); expect(transparent).toBe(frames);
    expect(readFileSync('src/components/PuppyMascot.tsx', 'utf8')).toContain(`'${name}': require('../assets/images/puppy/${name}.gif')`);
  });
  it.each([
    ['hotel', 'DRIVING', '-6'], ['food', 'TRANSIT', '-10'], ['restaurant', 'WALKING', '-10'],
    ['flight', 'DRIVING', '-8'], ['transit', 'TRANSIT', '-8'], ['transit', 'DRIVING', 'journal-drive'],
    ['transport', 'WALKING', '-11'], ['spot', 'DRIVING', 'journal-drive'], ['UNKNOWN', 'TRANSIT', '-8'],
    [' HOTEL ', 'WALKING', '-6'],
  ])('chooses %s / %s deliberately instead of randomly', async (category, mode, expected) => {
    const module = await import('../lib/puppy');
    expect(module).toHaveProperty('getNavigationPuppy');
    const get = (module as unknown as { getNavigationPuppy: (category: string, mode: string) => string }).getNavigationPuppy;
    expect(get(category, mode)).toBe(expected);
  });
  it.each(['constructor', '__proto__'])('uses fallback artwork for inherited object keys: %s', async category => {
    const { getNavigationPuppy } = await import('../lib/puppy');
    expect(getNavigationPuppy(category)).toBe('-8');
  });
});

describe('scoped journal presentation', () => {
  it.each(['light', 'dark'] as const)('keeps small journal text at 4.5:1 contrast in %s mode', async mode => {
    const { getTripJournalPalette } = await import('../lib/trip-journal');
    const p = getTripJournalPalette(getAppTheme(mode));
    const luminance = (hex: string) => {
      const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const ratio = (fg: string, bg: string) => {
      const a = luminance(fg), b = luminance(bg);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    expect(ratio(p.accentText ?? p.accent, p.soft)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.mutedOnSoft ?? p.muted, p.soft)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.accentText ?? p.accent, p.page)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.muted, p.page)).toBeGreaterThanOrEqual(4.5);
  });
  it('uses oat/coffee colors without turning dark mode into a white surface', async () => {
    expect(existsSync('lib/trip-journal.ts')).toBe(true);
    const { getTripJournalPalette } = await import('../lib/trip-journal');
    const light = getTripJournalPalette(getAppTheme('light'));
    const dark = getTripJournalPalette(getAppTheme('dark'));
    expect(light).toMatchObject({ page: '#F7F3EB', paper: '#FFFDF8', accent: '#8C6D58', ink: '#49392E' });
    expect(dark.paper).toBe(getAppTheme('dark').colors.surface);
    expect(dark.ink).toBe(getAppTheme('dark').colors.text);
    expect(dark.paper).not.toBe(light.paper);
  });
  it('enlarges only navigation art and uses the existing selected segment mode', () => {
    const source = readFileSync('src/components/ItineraryTimeline.shared.tsx', 'utf8');
    expect(source).toContain('navigationPuppyId(item.category, segment?.mode)');
    expect(source).toContain('size={28}');
    expect(source).toContain('width: 28, height: 28');
    expect(source).toContain('getNavigationPuppy(category, mode)');
    expect(source).not.toContain('mixBlendMode');
  });
  it('applies journal surfaces to the page/cards rather than leaking hard white into dark mode', () => {
    const route = readFileSync('src/app/trips/[id].tsx', 'utf8');
    const card = readFileSync('src/components/ItineraryTimeline.shared.tsx', 'utf8');
    expect(route).toContain('backgroundColor: getTripJournalPalette(theme).page');
    expect(route.includes('backgroundColor: getTripJournalPalette(theme).accent')).toBe(true);
    expect(card).toContain('backgroundColor: journal.paper');
    expect(card).toContain('color: journal.ink');
  });
});
