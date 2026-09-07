/** Tables whose rows are scoped to a trip and can be shared in real time. */
export const REALTIME_TRIP_TABLES = ['itinerary_items', 'trip_places', 'expenses', 'packing_items'] as const;
export type RealtimeTripTable = typeof REALTIME_TRIP_TABLES[number];
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';
export type RealtimeRecord = Record<string, any>;

export type RealtimeChange = {
  table: RealtimeTripTable;
  eventType: RealtimeEventType;
  record: RealtimeRecord;
  oldRecord: RealtimeRecord;
};

export type RealtimeChannelLike = {
  on: (
    event: 'postgres_changes',
    filter: { event: '*'; schema: 'public'; table: RealtimeTripTable; filter: string },
    callback: (payload: { eventType: RealtimeEventType; new?: RealtimeRecord; old?: RealtimeRecord }) => void,
  ) => RealtimeChannelLike;
  subscribe: () => unknown;
};

export type RealtimeClientLike = {
  channel: (name: string) => RealtimeChannelLike;
  removeChannel: (channel: RealtimeChannelLike) => unknown;
};

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Returns true when an incoming row is older than the locally visible row. */
export function isOlderRealtimeChange(current: unknown, incoming: unknown): boolean {
  const currentTime = timestamp(current);
  const incomingTime = timestamp(incoming);
  return currentTime !== null && incomingTime !== null && incomingTime < currentTime;
}

/** Apply one Realtime event while preserving newer local edits (Last Write Wins). */
export function applyRealtimeChange<T extends { id: string; updated_at?: string | null }>(rows: readonly T[], change: RealtimeChange): T[] {
  const id = String(change.record.id ?? change.oldRecord.id ?? '');
  if (!id) return [...rows];
  const index = rows.findIndex((row) => row.id === id);
  const existing = index >= 0 ? rows[index] : undefined;

  if (change.eventType === 'DELETE') {
    if (!existing || isOlderRealtimeChange(existing.updated_at, change.oldRecord.updated_at)) return [...rows];
    return rows.filter((row) => row.id !== id);
  }

  if (existing && isOlderRealtimeChange(existing.updated_at, change.record.updated_at)) return [...rows];
  const next = { ...(existing ?? {}), ...change.record, id } as T;
  if (index < 0) return [...rows, next];
  return rows.map((row, rowIndex) => rowIndex === index ? next : row);
}

/** Subscribe to all trip-scoped tables and return an idempotent cleanup function. */
export function subscribeToTripRealtime(client: RealtimeClientLike, tripId: string, onChange: (change: RealtimeChange) => void): () => void {
  if (!tripId.trim()) return () => undefined;
  const channel = client.channel(`trip-realtime:${tripId}`);
  for (const table of REALTIME_TRIP_TABLES) {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `trip_id=eq.${tripId}`,
    }, (payload) => {
      onChange({
        table,
        eventType: payload.eventType,
        record: payload.new ?? {},
        oldRecord: payload.old ?? {},
      });
    });
  }
  channel.subscribe();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void client.removeChannel(channel);
  };
}
