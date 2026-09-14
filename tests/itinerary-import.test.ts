import { describe, expect, it } from 'vitest';
import { mapDraftToTargetTrip, mergeImportedItems, normalizeImportedText } from '../lib/itinerary-import';

describe('itinerary import contract', () => {
  it('normalizes any destination and builds every day in an inclusive date range', () => {
    const draft = normalizeImportedText('Paris 3 days\n2027/04/10～2027/04/12\n04/10｜Louvre Museum');

    expect(draft.title).toContain('Paris');
    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    expect(draft.days.map((day) => day.date)).toEqual(['2027-04-10', '2027-04-11', '2027-04-12']);
  });

  it('parses a generic multi-city Markdown itinerary without city-specific rules', () => {
    const draft = normalizeImportedText([
      '**Lisbon 2 nights｜2027/05/03～05/05**',
      '**05/03 (Mon)｜Old Town**',
      '- 09:30～11:00：Explore Alfama',
      '- Afternoon visit to Belém Tower',
      '**05/04 (Tue)｜Museums**',
      '- 10:00 Visit the Maritime Museum',
    ].join('\n'));

    expect(draft.destination).toBe('Lisbon');
    expect(draft.days).toHaveLength(3);
    expect(draft.days[0].items.map((item) => item.title)).toEqual(['Explore Alfama', 'Belém Tower']);
    expect(draft.days[0].items[0]).toMatchObject({ startTime: '09:30', durationMinutes: 90 });
    expect(draft.days[1].items[0].title).toContain('Maritime Museum');
  });

  it('uses existing flight parsing for booking lines in any destination', () => {
    const draft = normalizeImportedText('2027/05/03\nBR178 06:30-10:10 TPE to KIX');

    expect(draft.days[0].items[0]).toMatchObject({ category: 'flight', startTime: '06:30', durationMinutes: 220 });
  });

  it('parses a Chinese AI itinerary sample and keeps the full date range', () => {
    const draft = normalizeImportedText([
      '**大阪 6 天 5 夜｜2026/10/23～10/28**',
      '**10/23（五）｜黑門市場、難波、道頓堀**',
      '- 06:00 抵達關西機場，入境後前往市區、寄放行李。',
      '- 約 10:00 到黑門市場逛街、吃早午餐。',
      '**10/24（六）｜梅田逛街、空中庭園夜景**',
      '- 上午吃早餐，前往梅田。',
      '**10/28（三）｜返回台灣**',
      '- 15:30 起飛，返回桃園。',
    ].join('\n'));

    expect(draft.destination).toBe('大阪');
    expect(draft.days).toHaveLength(6);
    expect(draft.days[0].items[0]).toMatchObject({ title: '關西機場', startTime: '06:00', category: 'flight' });
    expect(draft.days[0].items[1]).toMatchObject({ startTime: '10:00', category: 'food' });
    expect(draft.days[0].items[1].title).toContain('黑門市場');
    expect(draft.days[5].items[0]).toMatchObject({ startTime: '15:30' });
  });

  it('keeps preview day numbers unchanged when converting to database payloads', () => {
    const draft = normalizeImportedText([
      '大阪｜2026/10/23～2026/10/25',
      '10/23（五）｜黑門市場', '- 10:00 黑門市場',
      '10/24（六）｜梅田', '- 10:00 梅田',
      '10/25（日）｜住吉大社', '- 10:00 住吉大社',
    ].join('\n'));
    const payloads = mapDraftToTargetTrip(draft, { startDate: '2026-10-23', dayOffset: 0 });
    expect(payloads.map((item) => [item.day_number, item.location_name])).toEqual([
      [1, '黑門市場'], [2, '梅田'], [3, '住吉大社'],
    ]);
  });

  it('maps date-less items from a selected target day', () => {
    const mapped = mapDraftToTargetTrip(
      { days: [{ dayNumber: 1, items: [{ title: 'Museum' }] }], warnings: [] },
      { startDate: '2027-04-10', dayOffset: 2 },
    );

    expect(mapped[0]).toMatchObject({ day_number: 3, location_name: 'Museum' });
  });

  it('supports Day-number headings when the source omits calendar dates', () => {
    const draft = normalizeImportedText([
      'Weekend city break',
      'Day 1｜Old Town',
      '- 09:00 Visit the market',
      'Day 3｜Museums',
      '- 10:30 Visit the gallery',
    ].join('\n'));

    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    expect(draft.days.map((day) => day.items[0]?.title)).toEqual(['the market', undefined, 'the gallery']);
  });

  it('deduplicates by day, title and start time', () => {
    const merged = mergeImportedItems(
      [{ id: 'existing', day_number: 1, location_name: 'Museum', time: '10:00' }],
      [
        { location_name: ' Museum ', day_number: 1, time: '10:00' },
        { location_name: 'Museum', day_number: 1, time: '11:00' },
      ],
    );

    expect(merged.added).toHaveLength(1);
    expect(merged.skipped).toHaveLength(1);
  });
});
