export type PackingCategory = '證件' | '電子產品' | '衣物' | '藥品' | '隨身物品' | '未分類';
export const PACKING_CATEGORIES: PackingCategory[] = ['證件', '電子產品', '衣物', '藥品', '隨身物品', '未分類'];
export type PackingTemplate = '國內輕旅行' | '國外海島' | '雪國滑雪' | '日韓都市';
export type PackingItemLike = { is_checked?: boolean; is_packed?: boolean; assigned_to_all?: boolean; category: string; name?: string; item_name?: string; title?: string };
export type PackingForecastHint = { precipitationProbability: number | null };
export type PackingWeatherHint = { precipitationProbability: number | null; temperatureMinC: number | null; temperatureMaxC: number | null; forecast?: PackingForecastHint[] | null };
export type PackingSuggestion = { category: PackingCategory; name: string; assigned_to_all?: boolean };
export type PackingAssignmentOption = { assignedTo: string | null; allMembers: boolean };
export const RAIN_GEAR_NAME = '折疊傘 / 雨具';

export function getPackingAssignmentOptions(memberIds: readonly string[]): PackingAssignmentOption[] {
  return [{ assignedTo: null, allMembers: false }, ...memberIds.map((assignedTo) => ({ assignedTo, allMembers: false })), { assignedTo: null, allMembers: true }];
}

/** Return the avatar ids that should be rendered for an assignee control. */
export function getPackingAvatarIds(memberIds: readonly string[], assignedTo: string | null | undefined, assignedToAll: boolean): string[] {
  return assignedToAll ? [...memberIds] : assignedTo ? [assignedTo] : [];
}

export function hasRainyForecast(forecast: readonly PackingForecastHint[] | null | undefined, threshold = 50): boolean {
  return (forecast ?? []).some((day) => day.precipitationProbability != null && day.precipitationProbability >= threshold);
}
export function packingItemName(item: Pick<PackingItemLike, 'name' | 'item_name' | 'title'>): string {
  return String(item.name ?? item.item_name ?? item.title ?? '').trim();
}
function packingNameIdentity(name: string): string {
  const normalized = name.toLocaleLowerCase().replace(/[\s\-_/／、，,]+/g, '');
  if (/(護照|身分證|身份證|passport|identitycard)/i.test(normalized)) return 'travel-document';
  return normalized;
}
export function packingItemKey(item: Pick<PackingItemLike, 'category' | 'name' | 'item_name' | 'title'>): string {
  return `${String(item.category ?? '').trim().toLocaleLowerCase()}\u0000${packingNameIdentity(packingItemName(item))}`;
}
export function dedupePackingItems<T extends PackingItemLike>(incoming: T[], existing: PackingItemLike[] = []): T[] {
  const seen = new Set(existing.map(packingItemKey));
  return incoming.filter((item) => {
    const key = packingItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function packingProgress(items: PackingItemLike[]) { const total = items.length; const completed = items.filter((item) => item.is_packed ?? item.is_checked ?? false).length; return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 }; }
export function isPackingComplete(items: PackingItemLike[]) { return items.length > 0 && items.every((item) => item.is_packed ?? item.is_checked ?? false); }
const common: { category: PackingCategory; name: string }[] = [{ category: '證件', name: '身分證／護照' }, { category: '電子產品', name: '手機與充電器' }, { category: '隨身物品', name: '錢包' }];
const templates: Record<PackingTemplate, { category: PackingCategory; name: string; assigned_to_all?: boolean }[]> = { '國內輕旅行': [...common, { category: '衣物', name: '換洗衣物' }, { category: '藥品', name: '常備藥品' }], '國外海島': [...common, { category: '證件', name: '旅遊保險資料' }, { category: '衣物', name: '泳衣與防曬' }, { category: '隨身物品', name: '墨鏡' }, { category: '藥品', name: '暈船藥' }], '雪國滑雪': [...common, { category: '衣物', name: '保暖外套' }, { category: '衣物', name: '滑雪手套' }, { category: '隨身物品', name: '護唇膏' }, { category: '藥品', name: '暖暖包' }], '日韓都市': [...common, { category: '證件', name: 'Visit Japan Web 填寫', assigned_to_all: true }, { category: '證件', name: '入境卡', assigned_to_all: true }, { category: '隨身物品', name: '日幣現金' }, { category: '隨身物品', name: '韓元現金' }, { category: '隨身物品', name: 'ICOCA/Suica' }, { category: '電子產品', name: '網卡/漫遊' }, { category: '電子產品', name: '日本插頭/轉接頭' }] };
export function templateItems(template: PackingTemplate) { return templates[template].map((item) => ({ ...item, is_checked: false })); }
export function groupPackingItems<T extends PackingItemLike>(items: T[]) { return items.reduce<Record<string, T[]>>((groups, item) => { (groups[item.category] ??= []).push(item); return groups; }, {}); }

/** Generate deterministic packing suggestions from destination keywords and forecast hints. */
export function generatePackingSuggestions(destination: string, weather?: PackingWeatherHint | null): PackingSuggestion[] {
  const text = destination.toLocaleLowerCase();
  const suggestions: PackingSuggestion[] = [
    { category: '證件', name: '護照／身分證' },
    { category: '電子產品', name: '手機與充電器' },
    { category: '隨身物品', name: '錢包' },
    { category: '衣物', name: '換洗衣物' },
    { category: '藥品', name: '常備藥品' },
  ];
  if (/(海|島|海灘|沖繩|墾丁|beach|island)/i.test(text)) {
    suggestions.push({ category: '衣物', name: '泳衣' }, { category: '藥品', name: '防曬乳' });
  }
  if (/(雪|滑雪|北海道|冬|ski)/i.test(text)) {
    suggestions.push({ category: '衣物', name: '保暖外套' }, { category: '衣物', name: '滑雪手套' });
  }
  if (/(日本|jp|japan|大阪|東京|京都|關西|韓國|kr|korea|首爾|seoul|osaka|tokyo)/i.test(text)) {
    suggestions.push(
      { category: '證件', name: 'Visit Japan Web 填寫', assigned_to_all: true },
      { category: '證件', name: '入境卡', assigned_to_all: true },
      { category: '隨身物品', name: '日幣現金' },
      { category: '隨身物品', name: 'ICOCA/Suica' },
      { category: '電子產品', name: '網卡/漫遊' },
      { category: '電子產品', name: '日本插頭/轉接頭' },
    );
  }
  if ((weather?.precipitationProbability !== null && weather?.precipitationProbability !== undefined && weather.precipitationProbability >= 50)
    || hasRainyForecast(weather?.forecast)) {
    suggestions.push({ category: '隨身物品', name: RAIN_GEAR_NAME });
  }
  if (weather?.temperatureMinC !== null && weather?.temperatureMinC !== undefined && weather.temperatureMinC <= 15) {
    suggestions.push({ category: '衣物', name: '保暖衣物' });
  }
  if (weather?.temperatureMaxC !== null && weather?.temperatureMaxC !== undefined && weather.temperatureMaxC >= 28) {
    suggestions.push({ category: '隨身物品', name: '遮陽帽' });
  }
  const seen = new Set<string>();
  return suggestions.filter((item) => {
    const key = `${item.category}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
