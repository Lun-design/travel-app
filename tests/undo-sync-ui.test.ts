import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createUndoController } from '../lib/undo-sync';
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
vi.mock('@/lib/theme', async () => await import('../lib/theme'));
vi.mock('@/lib/undo-sync', async () => await import('../lib/undo-sync'));
import { UndoToast } from '../src/components/UndoToast';
import { OfflineSyncBanner } from '../src/components/OfflineSyncBanner';
type Props = { children?: React.ReactNode; accessibilityLabel?: string; disabled?: boolean; onPress?: () => void; puppy?: string };
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === 'string' ? node : '';
}
describe('undo and sync controls', () => {
  it('hides only healthy status when compact header owns that status', () => {
    const base = { isOffline: false, pendingCount: 0, conflicts: [], onResolve: vi.fn(), hideHealthy: true };
    expect(OfflineSyncBanner(base)).toBeNull();
    for (const state of [{ isOffline: true }, { pendingCount: 1 }, { syncing: true }, { undoPending: true }, { error: 'denied' }]) {
      expect(OfflineSyncBanner({ ...base, ...state })).not.toBeNull();
    }
  });
  it('shows a small driving puppy only while sync is in progress', () => {
    const base = { isOffline: false, pendingCount: 0, conflicts: [], onResolve: vi.fn() };
    const syncing = OfflineSyncBanner({ ...base, syncing: true });
    expect(nodes(syncing).find((node) => node.type === 'mascot')?.props.puppy).toBe('journal-drive');
    expect(nodes(OfflineSyncBanner(base)).some((node) => node.type === 'mascot')).toBe(false);
  });
  it('clicking the visible undo button prevents the pending API call', async () => {
    const commit = vi.fn(async () => undefined);
    const controller = createUndoController({ onChange: vi.fn(), onError: vi.fn() });
    await controller.stage({ label: '已刪除景點', commit });
    const toast = UndoToast({ label: '已刪除景點', canUndo: true, busy: false, bottom: 80, onUndo: controller.undo });
    const button = nodes(toast).find((node) => node.props.accessibilityLabel === '復原上次操作');
    expect(button?.props.disabled).toBe(false);
    button!.props.onPress!();
    await controller.dispose();
    expect(commit).not.toHaveBeenCalled();
  });
  it('disables undo during persistence and removes the control afterward', () => {
    const busy = UndoToast({ label: '已移動', canUndo: true, busy: true, bottom: 80, onUndo: vi.fn() });
    expect(nodes(busy).find((node) => node.props.accessibilityLabel === '復原上次操作')?.props.disabled).toBe(true);
    expect(UndoToast({ label: '', canUndo: false, busy: false, bottom: 80, onUndo: vi.fn() })).toBeNull();
  });
  it('shows saved status and offers an actionable retry only when online', () => {
    const onRetry = vi.fn();
    const base = { isOffline: false, pendingCount: 0, conflicts: [], onResolve: vi.fn(), onRetry };
    expect(text(OfflineSyncBanner(base))).toContain('已同步');
    const failed = OfflineSyncBanner({ ...base, error: 'permission denied' });
    expect(text(failed)).toContain('同步失敗');
    expect(text(failed)).toContain('permission denied');
    nodes(failed).find((node) => node.props.accessibilityLabel === '重試同步')!.props.onPress!();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(nodes(OfflineSyncBanner({ ...base, isOffline: true, error: 'offline' })).some((node) => node.props.accessibilityLabel === '重試同步')).toBe(false);
  });
});
