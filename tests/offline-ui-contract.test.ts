import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('offline UI integration contract', () => {
  it('wires trip detail to scoped cache, reconnect sync, and conflict actions', () => {
    const source = [
      read('src/app/trips/[id].tsx'),
      read('src/hooks/useTripDetailData.ts'),
    ].join('\n');
    expect(source).toContain('offlineSyncService.sync');
    expect(source).toContain('offlineStore.listMutations');
    expect(source).toContain('<OfflineSyncBanner');
    expect(source).toContain('resolveConflict');
  });

  it('passes an offline scope through packing mutations', () => {
    const source = read('src/components/PackingPanel.tsx');
    expect(source).toContain('offlineScope');
    expect(source).toContain('offlineStore');
  });

  it('renders an avatar stack for all-members packing assignments', () => {
    const source = read('src/components/PackingPanel.tsx');
    expect(source).toContain('item.assigned_to_all');
    expect(source).toContain('avatarIds.map');
    expect(source).toContain('styles.avatarStack');
    expect(source).toContain('<ProfileAvatar profile={memberFor(id)?.profile} userId={id}');
  });
});
