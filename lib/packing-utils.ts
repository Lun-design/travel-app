export type PackingCategory = '證件' | '電子產品' | '衣物' | '藥品' | '隨身物品' | '未分類';
export type PackingTemplate = '國內輕旅行' | '國外海島' | '雪國滑雪';
export type PackingItemLike = { is_checked: boolean; category: string };
export function packingProgress(items: PackingItemLike[]) { const total = items.length; const completed = items.filter((item) => item.is_checked).length; return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 }; }
const common = [{ category: '證件', name: '身分證／護照' }, { category: '電子產品', name: '手機與充電器' }, { category: '隨身物品', name: '錢包' }];
const templates: Record<PackingTemplate, { category: string; name: string }[]> = { '國內輕旅行': [...common, { category: '衣物', name: '換洗衣物' }, { category: '藥品', name: '常備藥品' }], '國外海島': [...common, { category: '證件', name: '旅遊保險資料' }, { category: '衣物', name: '泳衣與防曬' }, { category: '隨身物品', name: '墨鏡' }, { category: '藥品', name: '暈船藥' }], '雪國滑雪': [...common, { category: '衣物', name: '保暖外套' }, { category: '衣物', name: '滑雪手套' }, { category: '隨身物品', name: '護唇膏' }, { category: '藥品', name: '暖暖包' }] };
export function templateItems(template: PackingTemplate) { return templates[template].map((item) => ({ ...item, is_checked: false })); }
export function groupPackingItems<T extends PackingItemLike>(items: T[]) { return items.reduce<Record<string, T[]>>((groups, item) => { (groups[item.category] ??= []).push(item); return groups; }, {}); }
