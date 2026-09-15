import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCategoryBadgePalette, MOBILE_ACCENT_ORANGE } from '../lib/visual-styles';

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

  it('uses a vivid orange accent for active mobile controls', () => {
    expect(MOBILE_ACCENT_ORANGE).toBe('#E05D38');
    const theme = readFileSync(projectFile('lib', 'theme.ts'), 'utf8');
    const tabs = readFileSync(projectFile('src', 'components', 'DayTabs.tsx'), 'utf8');
    const detail = readFileSync(projectFile('src', 'app', 'trips', '[id].tsx'), 'utf8');
    expect(theme).toContain("MOBILE_ACCENT_ORANGE = '#E05D38'");
    expect(tabs).toContain('accentColor?: string');
    expect(detail).toContain('backgroundColor: layout.compact ? MOBILE_ACCENT_ORANGE : theme.colors.primary');
  });

  it('renders a dark slate day hero and colored metrics icons', () => {
    const panel = readFileSync(projectFile('src', 'components', 'trip-detail', 'TimelinePanel.tsx'), 'utf8');
    const metrics = readFileSync(projectFile('src', 'components', 'DashboardMetricsBar.tsx'), 'utf8');
    expect(panel).toContain('#1F2937');
    expect(panel).toContain('#0F172A');
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
});
