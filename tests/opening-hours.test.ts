import { describe, expect, it } from 'vitest';
import { draftToOpeningHours, toOpeningHoursDraft } from '../lib/opening-hours';

describe('opening-hours visual editor state', () => {
  it('starts with an unconfigured draft without persisting empty hours', () => {
    const draft = toOpeningHoursDraft(null);
    expect(draft.monday).toEqual({ closed: false, periods: [] });
    expect(draftToOpeningHours(draft)).toBeNull();
  });

  it('round-trips multiple periods and a rest day into JSON data', () => {
    const draft = toOpeningHoursDraft({
      monday: { closed: false, periods: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '18:00' }] },
      tuesday: { closed: true, periods: [] },
    });
    const value = draftToOpeningHours(draft);

    expect(value?.monday).toEqual({ closed: false, periods: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '18:00' }] });
    expect(value?.tuesday).toEqual({ closed: true, periods: [] });
    expect(Object.keys(value ?? {})).toHaveLength(7);
  });
});
