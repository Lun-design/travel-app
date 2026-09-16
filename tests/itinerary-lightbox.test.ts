import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('itinerary spot image lightbox', () => {
  it('wires thumbnail press, backdrop close, and an explicit close button', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');

    expect(source).toContain('lightboxVisible');
    expect(source).toContain('setLightboxVisible(true)');
    expect(source).toContain('accessibilityLabel={`放大查看 ${item.location_name}`}');
    expect(source).toContain('styles.lightboxBackdrop');
    expect(source).toContain('accessibilityLabel="關閉照片預覽"');
    expect(source).toContain('getSpotImageLightboxUrl');
    expect(source).toContain('更換照片');
    expect(source).toContain('searchSpotImage');
    expect(source).toContain('setResolvedImageUrl(result.url)');
  });
});
