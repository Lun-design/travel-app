import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('home trip actions', () => {
  it('provides a prominent create CTA and a styled list-footer create action', () => {
    const home = source('src/app/index.tsx');
    expect(home).toContain('accessibilityLabel="建立行程"');
    expect(home).toContain('＋ 建立行程');
    expect(home).toContain("headerTop: { flexDirection: 'row', flexWrap: 'wrap'");
    expect(home).toContain('新增另一個行程');
    expect(home).toContain('styles.secondary');
    expect(home).toContain('borderStyle: \'dashed\'');
  });

  it('reduces trip cover height and exposes edit plus role-specific exit/delete actions', () => {
    const home = source('src/app/index.tsx');
    expect(home).toContain('cover: { height: 132');
    expect(home).toContain('編輯行程');
    expect(home).toContain('刪除行程');
    expect(home).toContain('退出行程');
    expect(home).toContain('tripManagementAction');
    expect(home).toContain('disabled={isActionBusy}');
  });

  it('uses an authenticated RPC to let non-owners leave and owner RLS to delete trips', () => {
    const trips = source('lib/trips.ts');
    const migration = source('supabase/migrations/20261007010000_trip_membership_actions.sql');
    expect(trips).toContain('export async function deleteTrip');
    expect(trips).toContain("from('trips').delete()");
    expect(trips).toContain('export async function leaveTrip');
    expect(trips).toContain("rpc('leave_trip'");
    expect(migration).toContain('create or replace function public.leave_trip');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain("v_role = 'owner'");
  });

  it('allows the trip form to save edits to title, destination and dates', () => {
    const form = source('src/components/CreateTripModal.tsx');
    const trips = source('lib/trips.ts');
    expect(form).toContain('initialTrip');
    expect(form).toContain('onUpdate');
    expect(trips).toContain("'title' | 'destination' | 'start_date' | 'end_date'");
  });
});
