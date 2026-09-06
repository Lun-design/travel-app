import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', '20260906000000_harden_trip_data_access.sql');
const timezoneMigrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', '20260906010000_trip_timezones.sql');

describe('trip data access hardening migration', () => {
  it('exists and defines membership-aware security helpers', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('private.is_trip_member_for_user');
    expect(sql).toContain('private.can_view_profile');
  });

  it('tightens profile, expense, packing, and document policies', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('using (private.can_view_profile(id))');
    expect(sql).toContain('private.is_trip_member_for_user(trip_id, created_by)');
    expect(sql).toContain('private.is_trip_member_for_user(trip_id, payer)');
    expect(sql).toContain('private.is_trip_member_for_user(trip_id, payer_id)');
    expect(sql).toContain('private.is_trip_member_for_user(e.trip_id, user_id)');
    expect(sql).toContain('packing_items_assigned_to_idx');
    expect(sql).toContain('travel_documents_delete_member');
    expect(sql).toContain("storage.foldername(name))[2] = auth.uid()::text");
  });

  it('adds a safe IANA timezone default to trips', () => {
    expect(existsSync(timezoneMigrationPath)).toBe(true);
    const sql = readFileSync(timezoneMigrationPath, 'utf8');
    expect(sql).toContain("default 'Asia/Taipei'");
    expect(sql).toContain('update public.trips');
    expect(sql).toContain('set not null');
  });
});
