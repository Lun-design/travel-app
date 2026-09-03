export type GeocodingResult = { id: string; displayName: string; latitude: number; longitude: number };
export function parseNominatimResults(results: Array<{ place_id: number | string; display_name: string; lat: string; lon: string }>): GeocodingResult[] {
  return results.map((r) => ({ id: String(r.place_id), displayName: r.display_name, latitude: Number(r.lat), longitude: Number(r.lon) })).filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
}
export async function searchNominatim(query: string): Promise<GeocodingResult[]> {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=zh-TW&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'TravelPlanner/1.0 contact: travel-planner@example.com' } });
  if (!response.ok) throw new Error(response.status === 429 ? '地圖搜尋過於頻繁，請稍後再試' : '地圖搜尋失敗');
  return parseNominatimResults(await response.json());
}
