/** Normalize browser/native values to the API's strict 24-hour clock format. */
export function normalizeTimeValue(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Open a browser's native date/time picker from any click inside its field. */
export function openNativePicker(input: Pick<HTMLInputElement, 'showPicker' | 'focus'>): void {
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // Some browsers reject showPicker outside a supported input gesture.
    }
  }
  input.focus();
}

/** Backward-compatible name for callers that specifically use a time field. */
export const openTimePicker = openNativePicker;

export function buildTimeOptions(stepMinutes = 15): string[] {
  const step = Number.isFinite(stepMinutes) && stepMinutes > 0 ? Math.round(stepMinutes) : 15;
  const options: string[] = [];
  for (let total = 0; total < 24 * 60; total += step) {
    options.push(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  }
  return options;
}

/** Keep date state in the ISO format accepted by Supabase and HTML date inputs. */
export function normalizeDateValue(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}
