export type PackingCategory = '證件' | '電子產品' | '衣物' | '藥品' | '隨身物品' | '未分類';
export type PackingTemplate = '國內輕旅行' | '國外海島' | '雪國滑雪';
export type PackingItemLike = { is_checked?: boolean; is_packed?: boolean; category: string };
export type PackingWeatherHint = { precipitationProbability: number | null; temperatureMinC: number | null; temperatureMaxC: number | null };
export type PackingSuggestion = { category: PackingCategory; name: string };
export function packingProgress(items: PackingItemLike[]) { const total = items.length; const completed = items.filter((item) => item.is_packed ?? item.is_checked ?? false).length; return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 }; }
export function isPackingComplete(items: PackingItemLike[]) { return items.length > 0 && items.every((item) => item.is_packed ?? item.is_checked ?? false); }
const common = [{ category: '證件', name: '身分證／護照' }, { category: '電子產品', name: '手機與充電器' }, { category: '隨身物品', name: '錢包' }];
const templates: Record<PackingTemplate, { category: string; name: string }[]> = { '國內輕旅行': [...common, { category: '衣物', name: '換洗衣物' }, { category: '藥品', name: '常備藥品' }], '國外海島': [...common, { category: '證件', name: '旅遊保險資料' }, { category: '衣物', name: '泳衣與防曬' }, { category: '隨身物品', name: '墨鏡' }, { category: '藥品', name: '暈船藥' }], '雪國滑雪': [...common, { category: '衣物', name: '保暖外套' }, { category: '衣物', name: '滑雪手套' }, { category: '隨身物品', name: '護唇膏' }, { category: '藥品', name: '暖暖包' }] };
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
  if (weather?.precipitationProbability !== null && weather?.precipitationProbability !== undefined && weather.precipitationProbability > 40) {
    suggestions.push({ category: '隨身物品', name: '雨具' });
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
