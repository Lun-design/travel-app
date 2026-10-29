import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('puppy travel states', () => {
  it('uses a planning puppy and an inviting message for an empty day', () => {
    const timeline = readFileSync('src/components/ItineraryTimeline.shared.tsx', 'utf8');
    expect(timeline).toContain('puppy="journal-reading" size={104}');
    expect(timeline).toContain('小狗在等你安排第一站，準備好就出發！');
  });

  it('shows a planning puppy alongside the trip loading skeleton', () => {
    const tripDetail = readFileSync('src/app/trips/[id].tsx', 'utf8');
    expect(tripDetail).toContain('puppy="journal-reading" size={60}');
    expect(tripDetail).toContain('小狗正在整理旅程…');
  });
});
