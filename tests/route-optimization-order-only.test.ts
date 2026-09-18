import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('route optimization order-only persistence contract', () => {
  it('normalizes optimized items to an order-only payload before saving', () => {
    const screen = readFileSync('src/app/trips/[id].tsx', 'utf8');

    expect(screen).toContain('preserveItineraryTimes');
    expect(screen).toContain('const orderOnlyItems = preserveItineraryTimes(previousItems, optimizedItems);');
    expect(screen).toContain('orderOnlyItems.map((item, position) => ({ id: item.id, position }))');
    expect(screen).toContain('await data.reorderItems');
  });

  it('renders optimized rows with their original times and order hints', () => {
    const modal = readFileSync('src/components/RouteOptimizeModal.tsx', 'utf8');

    expect(modal).toContain('originalTimeById');
    expect(modal).toContain('originalPositionById');
    expect(modal).toContain('title="最佳化後" items={optimizedItems} originalTimeById={originalTimeById}');
  });
});
