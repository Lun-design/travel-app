import type { TravelMode } from './routes';

export type RouteLegContext = {
  fromName: string;
  toName: string;
  durationMinutes: number;
  mode: TravelMode;
};

export function formatRouteDuration(durationMinutes: number): string {
  const roundedMinutes = Math.max(0, Math.round(Number.isFinite(durationMinutes) ? durationMinutes : 0));
  if (roundedMinutes < 60) return `${roundedMinutes} 分鐘`;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes > 0 ? `${hours} 小時 ${minutes} 分鐘` : `${hours} 小時`;
}

function modeLabel(mode: TravelMode): string {
  if (mode === 'WALKING') return '🚶 步行';
  if (mode === 'TRANSIT') return '🚇 大眾運輸';
  return '🚗 車程';
}

export function formatRouteLegContext({ fromName, toName, durationMinutes, mode }: RouteLegContext): string {
  const origin = fromName.trim() || '上一站';
  const destination = toName.trim() || '下一站';
  return `${modeLabel(mode)}｜${origin} ➔ ${destination}：${mode === 'DRIVING' ? '車程' : mode === 'WALKING' ? '步行' : '行程'}約 ${formatRouteDuration(durationMinutes)}`;
}
