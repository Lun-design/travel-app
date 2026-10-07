export function tripListState<T>(rows: T[] | null, error?: string) {
  if (rows && rows.length === 0) return { kind: 'empty' as const };
  if (error) return { kind: 'error' as const, message: error };
  return { kind: 'ready' as const };
}

export function tripManagementAction(role: 'owner' | 'editor' | 'viewer' | undefined): 'delete' | 'leave' | null {
  if (role === 'owner') return 'delete';
  if (role === 'editor' || role === 'viewer') return 'leave';
  return null;
}
