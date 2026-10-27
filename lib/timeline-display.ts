/** Presentation only: never feed this result back into a saved item's notes. */
export function getTimelineDisplayNotes({ title, time, notes }: { title: string; time?: string | null; notes?: string | null }): string | null {
  if (!notes?.trim()) return null;
  const normalize = (value: string) => value.trim().replace(/[。.!！]$/, '').trim();
  const name = normalize(title);
  if (!name) return notes;
  const lines = notes.split(/\r?\n/);
  const filtered = lines.filter(line => {
    if (normalize(line) === name) return false;
    if (!time) return true;
    const timed = line.trim().match(/^(\d{1,2}:\d{2})\s*(?:[|｜/·]\s*)?(.*)$/);
    return !timed || timed[1] !== time || normalize(timed[2]) !== name;
  });
  if (filtered.length === lines.length) return notes;
  return filtered.join('\n').trim() || null;
}
