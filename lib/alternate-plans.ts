import type { ItineraryItem } from './itinerary';

export type RainSignal = { precipitationProbability: number | null; extremeWarning: boolean };
export type OutdoorRainAlert = { precipitationProbability: number; outdoorItems: ItineraryItem[]; message: string };

const OUTDOOR_KEYWORDS = ['戶外', '公園', '步道', '老街', '海邊', '海岸', '吊橋', '農場', '沙灘', '露營'];

/** Detect outdoor plans even when the category is a generic spot/trail value. */
export function isOutdoorItineraryItem(item: Pick<ItineraryItem, 'location_name' | 'address' | 'notes' | 'category'> & { tags?: string[] | null }): boolean {
  if (String(item.category ?? '').toLocaleLowerCase().includes('outdoor')) return true;
  const searchable = [item.location_name, item.address, item.notes, ...(item.tags ?? [])].filter(Boolean).join(' ');
  return searchable.toLocaleLowerCase().includes('outdoor') || OUTDOOR_KEYWORDS.some((keyword) => searchable.includes(keyword));
}

/** Show an alert only when daytime rain risk is at least 70% and today's plan is outdoors. */
export function getOutdoorRainAlert(weather: RainSignal | null | undefined, items: ItineraryItem[], threshold = 70): OutdoorRainAlert | null {
  const probability = weather?.precipitationProbability;
  if (probability === null || probability === undefined || probability < threshold) return null;
  const outdoorItems = items.filter((item) => isOutdoorItineraryItem(item));
  if (!outdoorItems.length) return null;
  return {
    precipitationProbability: probability,
    outdoorItems,
    message: `今日午後降雨機率高 (${Math.round(probability)}%)，行程包含戶外景點，建議評估開啟室內備案`,
  };
}

/** Rain above the product threshold, or an extreme WMO condition, suggests an indoor plan. */
export function shouldOfferAlternatePlan(weather: RainSignal | null | undefined, threshold = 50): boolean {
  if (!weather) return false;
  return weather.extremeWarning || (weather.precipitationProbability !== null && weather.precipitationProbability > threshold);
}

export function findBackupPlan(items: ItineraryItem[], primaryId: string): ItineraryItem | null {
  return items.find((item) => item.id !== primaryId && item.backup_for_id === primaryId) ?? null;
}

export function switchToBackupPlan(items: ItineraryItem[], primaryId: string): { items: ItineraryItem[]; activeItem: ItineraryItem | null } {
  const backup = findBackupPlan(items, primaryId);
  if (!backup) return { items: [...items], activeItem: null };
  const nextItems = items.map((item) => {
    if (item.id === primaryId) return { ...item, is_backup: true };
    if (item.id === backup.id) return { ...item, is_backup: false };
    return item;
  });
  return { items: nextItems, activeItem: nextItems.find((item) => item.id === backup.id) ?? null };
}
