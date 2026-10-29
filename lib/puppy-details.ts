const PACKING_PROGRESS_PAW_COUNT = 8;

export function getPackingPawProgress(completed: number, total: number): { filled: number; total: number } {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const safeCompleted = Math.min(safeTotal, Math.max(0, Math.floor(Number.isFinite(completed) ? completed : 0)));
  const filled = safeTotal === 0 ? 0 : Math.round((safeCompleted / safeTotal) * PACKING_PROGRESS_PAW_COUNT);
  return { filled, total: PACKING_PROGRESS_PAW_COUNT };
}

export function shouldSuggestRestBreak(durationMinutes: number | null | undefined): boolean {
  return typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes >= 120;
}
