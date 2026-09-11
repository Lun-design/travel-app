import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('UI mutation safety audit', () => {
  it('guards packing item mutations against repeated taps', () => {
    const source = read('src/components/PackingPanel.tsx');
    expect(source).toContain('const [mutatingItemId, setMutatingItemId]');
    expect(source).toContain('disabled={mutatingItemId === item.id}');
  });

  it('guards trip-place deletion while refreshing the parent list', () => {
    const source = read('src/components/TripPlacesPanel.tsx');
    expect(source).toContain('const [deletingPlaceId, setDeletingPlaceId]');
    expect(source).toContain('disabled={deletingPlaceId === place.id}');
    expect(source).toMatch(/finally\s*\{\s*setDeletingPlaceId\(null\)/);
  });

  it('guards document deletion while the Supabase mutation is pending', () => {
    const source = read('src/components/DocumentsPanel.tsx');
    expect(source).toContain('const [deletingDocumentId, setDeletingDocumentId]');
    expect(source).toContain('disabled={deletingDocumentId === document.id}');
  });

  it('prevents settlement rows from opening duplicate requests', () => {
    const source = read('src/components/SettlementCard.tsx');
    expect(source).toContain('disabled={settling}');
  });

  it('reconciles voucher mutations with the parent trip data', () => {
    const panel = read('src/components/VouchersPanel.tsx');
    const screen = read('src/app/trips/[id].tsx');
    expect(panel).toContain('onChanged?: () => void | Promise<void>');
    expect(panel).toContain('await onChanged?.()');
    expect(screen).toContain('<VouchersPanel');
    expect(screen).toContain('onChanged={data.reload}');
  });

  it('guards expense deletion while awaiting the parent reload', () => {
    const source = read('src/components/ExpenseList.tsx');
    expect(source).toContain('const [deletingId, setDeletingId]');
    expect(source).toContain('disabled={deletingId === expense.id}');
  });

  it('guards manual exchange-rate locking inside the expense modal', () => {
    const source = read('src/components/ExpenseModal.tsx');
    expect(source).toContain('const [lockingRate, setLockingRate]');
    expect(source).toContain('disabled={lockingRate}');
  });
});
