import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('offline itinerary move replay', () => {
  it('routes a move-day mutation back through the atomic move API', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'lib/offline-replay.ts'), 'utf8');
    expect(source).toContain("mutation.operation === 'move-day'");
    expect(source).toContain('moveItineraryItemToDay(mutation.resourceId, value.targetDay, options)');
  });
});
