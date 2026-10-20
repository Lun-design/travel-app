import { describe, expect, it } from 'vitest';
import * as packing from '../lib/packing-utils';

const rows = [
  { id: 'mine', category: '證件', is_checked: false, assigned_to: 'u' },
  { id: 'all', category: '證件', is_checked: false, assigned_to: null, assigned_to_all: true },
  { id: 'done', category: '證件', is_checked: true, assigned_to: 'u' },
  { id: 'other', category: '證件', is_checked: false, assigned_to: 'v' },
  { id: 'none', category: '衣物', is_checked: false, assigned_to: null },
];
describe('packing view filters', () => {
  it('combines category, incomplete and my assignment including shared items', () => {
    expect(packing.filterPackingItems(rows, { category: '證件', incompleteOnly: true, mineOnly: true }, 'u').map(r => r.id)).toEqual(['mine', 'all']);
  });
  it('shows everything by default without mutating the input', () => {
    const before = structuredClone(rows);
    expect(packing.filterPackingItems(rows, {}, 'u')).toEqual(rows);
    expect(rows).toEqual(before);
  });
  it('handles empty lists and anonymous users safely', () => {
    expect(packing.filterPackingItems([], {}, 'u')).toEqual([]);
    expect(packing.filterPackingItems(rows, { mineOnly: true }, 'anonymous')).toEqual([]);
    expect(packing.filterPackingItems(rows, { mineOnly: true })).toEqual([]);
  });
  it('uses authoritative checked state and falls back to legacy packed state', () => {
    const legacy = [{ category: '證件', is_checked: false, is_packed: true }, { category: '衣物', is_packed: true }];
    expect(packing.filterPackingItems(legacy, { incompleteOnly: true })).toEqual([legacy[0]]);
  });
});
