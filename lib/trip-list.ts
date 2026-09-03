export function tripListState<T>(rows: T[] | null, error?: string) {
  if (rows && rows.length === 0) return { kind: 'empty' as const };
  if (error) return { kind: 'error' as const, message: error };
  return { kind: 'ready' as const };
}
