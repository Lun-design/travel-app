import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCategoryBadgePalette, MOBILE_ACCENT_COFFEE } from '../lib/visual-styles';

const projectFile = (...parts: string[]) => path.resolve(process.cwd(), ...parts);

describe('mobile visual color polish', () => {
  it('maps each itinerary category to a readable pastel badge palette', () => {
    expect(getCategoryBadgePalette('flight')).toEqual({ backgroundColor: '#F0F9FF', color: '#0369A1', borderColor: '#BAE6FD' });
    expect(getCategoryBadgePalette('transit')).toEqual({ backgroundColor: '#F0F9FF', color: '#0369A1', borderColor: '#BAE6FD' });
    expect(getCategoryBadgePalette('spot')).toEqual({ backgroundColor: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0' });
    expect(getCategoryBadgePalette('hotel')).toEqual({ backgroundColor: '#FAF5FF', color: '#7E22CE', borderColor: '#E9D5FF' });
    expect(getCategoryBadgePalette('food')).toEqual({ backgroundColor: '#FFFBEB', color: '#B45309', borderColor: '#FDE68A' });
    expect(getCategoryBadgePalette('restaurant')).toEqual({ backgroundColor: '#FFFBEB', color: '#B45309', borderColor: '#FDE68A' });
  });

  it('keeps unknown categories on a neutral, legible fallback', () => {
    expect(getCategoryBadgePalette('unknown')).toEqual({ backgroundColor: '#F8FAFC', color: '#475569', borderColor: '#E2E8F0' });
  });

  it('uses a warm oat coffee accent for active controls', () => {
    expect(MOBILE_ACCENT_COFFEE).toBe('#8C6D58');
    const theme = readFileSync(projectFile('lib', 'theme.ts'), 'utf8');
    const tabs = readFileSync(projectFile('src', 'components', 'DayTabs.tsx'), 'utf8');
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');
    expect(theme).toContain("MOBILE_ACCENT_COFFEE = '#8C6D58'");
    expect(theme).toContain("DAY_ACTIVE_COLOR = '#8C6D58'");
    expect(tabs).toContain('accentColor?: string');
    expect(tabs).toContain('const activeColor = accentColor ?? DAY_ACTIVE_COLOR');
    expect(detail).toContain('backgroundColor: layout.compact ? MOBILE_ACCENT_COFFEE : theme.colors.primary');
  });

  it('renders a coffee day hero and colored metrics icons', () => {
    const panel = readFileSync(projectFile('src', 'components', 'trip-detail', 'TimelinePanel.tsx'), 'utf8');
    const metrics = readFileSync(projectFile('src', 'components', 'DashboardMetricsBar.tsx'), 'utf8');
    expect(panel).toContain("backgroundColor: '#8C6D58'");
    expect(panel).toContain("color: '#FFFFFF'");
    expect(panel).toContain("color: '#F5F5F4'");
    expect(panel).toContain("backgroundColor: pressed ? 'rgba(255,255,255,0.2)'");
    expect(panel).toContain("backgroundColor: '#F1F5F9'");
    expect(metrics).toContain('iconColor');
    expect(metrics).toContain('#DC4A3D');
    expect(metrics).toContain('#2563EB');
    expect(metrics).toContain('#16A34A');
  });

  it('keeps category badges and compact mobile spacing in the timeline card', () => {
    const timeline = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');
    expect(timeline).toContain('getCategoryBadgePalette');
    expect(timeline).toContain('categoryBadge');
    expect(timeline).toContain('backgroundColor: palette.backgroundColor');
    expect(timeline).toContain('borderColor: palette.borderColor');
    expect(timeline).toContain('paddingHorizontal: 8');
  });

  it('keeps category badges text-only after moving linedogs to navigation', () => {
    const timeline = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');
    expect(timeline).toContain('categoryPuppyId');
    expect(timeline).toContain("flight: '-8'");
    expect(timeline).toContain("hotel: '-6'");
    expect(timeline).toContain("food: '-10'");
    expect(timeline).toContain("spot: '-11'");
    const badge = timeline.slice(timeline.indexOf('function CategoryBadge'), timeline.indexOf('function formatDistance'));
    expect(badge).not.toContain('PuppyMascot');
    expect(badge).toContain('{category}</Text>');
  });

  it('places a compact transparent linedog inside the card navigation pill', () => {
    const timeline = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');
    const mascot = readFileSync(projectFile('src', 'components', 'PuppyMascot.tsx'), 'utf8');
    expect(timeline).toContain('navigationPuppyId');
    expect(timeline).toContain('<PuppyMascot puppy={navigationPuppyId(item.category)} size={20}');
    expect(timeline).toContain('navigationButton');
    expect(timeline).toContain('navigationPuppy');
    expect(timeline).not.toContain('routeLinkPuppy');
    expect(timeline).toContain("return categoryPuppies[category.trim().toLowerCase()] ?? '-8'");
    expect(timeline).not.toContain('disabled={!navigationUrl}');
    expect(timeline).toContain('getGoogleMapsNavigationUrl');
    expect(timeline).toContain('opacity: 1');
    expect(timeline).not.toContain('navigationButtonDisabled');
    expect(timeline).toContain('paddingHorizontal: 12');
    expect(timeline).toContain('paddingVertical: 6');
    expect(timeline).toContain('gap: 6');
    expect(timeline).toContain("backgroundColor: 'transparent'");
    expect(mascot).toContain('resizeMode="contain"');
    expect(mascot).toContain("backgroundColor: 'transparent'");
  });

  it('removes hard borders from hero controls, day tabs, and timeline surfaces', () => {
    const tabs = readFileSync(projectFile('src', 'components', 'DayTabs.tsx'), 'utf8');
    const panel = readFileSync(projectFile('src', 'components', 'trip-detail', 'TimelinePanel.tsx'), 'utf8');
    const drag = readFileSync(projectFile('lib', 'drag-drop.ts'), 'utf8');
    expect(tabs).toContain('borderWidth: 0');
    expect(tabs).toContain("const inactiveColor = '#94A3B8'");
    expect(panel).toContain('optimizeInlineButton: { minHeight: 34');
    expect(panel).toContain("backgroundColor: '#F1F5F9'");
    expect(panel).toContain('borderWidth: 0');
    expect(panel).toContain('mapToggle: {');
    expect(drag).toContain('borderWidth: 0');
    expect(drag).toContain('shadowOpacity: 0.05');
  });
});
