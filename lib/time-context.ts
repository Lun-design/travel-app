import { isValidTimezone } from './timezone';
const labels: Record<string, string> = { 'Asia/Taipei': '台灣', 'Asia/Tokyo': '日本', 'Asia/Seoul': '韓國', 'Asia/Hong_Kong': '香港', 'Asia/Singapore': '新加坡' };
/** Display only: no clock conversion and no guessing based on an airport or destination name. */
export function getTimeContextLabel(item: { location_name?: string | null }, tripTimezone?: string | null): string {
  const title = item.location_name ?? '';
  const explicit = title.match(/(?:台灣|臺灣|日本|韓國|韩国)時間/);
  if (explicit) return explicit[0].replace('臺灣', '台灣').replace('韩国', '韓國');
  const zone = tripTimezone?.trim();
  return zone && isValidTimezone(zone) ? `依行程時區 · ${labels[zone] ?? zone}` : '時區未註明';
}
