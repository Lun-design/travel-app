import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('offline UI integration contract', () => {
  it('wires trip detail to scoped cache, reconnect sync, and conflict actions', () => {
    const source = read('src/app/trips/[id].tsx');
    expect(source).toContain('offlineSyncService.sync');
    expect(source).toContain('offlineStore.listMutations');
    expect(source).toContain('<OfflineSyncBanner');
    expect(source).toContain('resolveSyncConflict');
  });

  it('passes an offline scope through packing mutations', () => {
    const source = read('src/components/PackingPanel.tsx');
    expect(source).toContain('offlineScope');
    expect(source).toContain('offlineStore');
  });
});
