export type VoucherCategory = 'flight' | 'hotel' | 'ticket' | 'transport' | 'other';

export const voucherCategoryOptions: Array<{ value: VoucherCategory; label: string; icon: string }> = [
  { value: 'flight', label: '機票', icon: '✈️' },
  { value: 'hotel', label: '住宿', icon: '🏨' },
  { value: 'ticket', label: '門票', icon: '🎟️' },
  { value: 'transport', label: '交通/網卡', icon: '🚗' },
  { value: 'other', label: '其他', icon: '📄' },
];

export function inferVoucherCategory(title: string | null | undefined): VoucherCategory {
  const value = (title ?? '').toLowerCase();
  if (/flight|airline|機票|航班|航空|機場/.test(value)) return 'flight';
  if (/hotel|住宿|飯店|旅館|民宿|airbnb/.test(value)) return 'hotel';
  if (/ticket|門票|票券|入場|展覽|usj|環球/.test(value)) return 'ticket';
  if (/transport|交通|車票|鐵路|地鐵|電車|網卡|sim|esim|icoca|suica/.test(value)) return 'transport';
  return 'other';
}

export function getVoucherCategoryLabel(category: VoucherCategory | null | undefined, title?: string | null) {
  const option = voucherCategoryOptions.find((entry) => entry.value === (category ?? inferVoucherCategory(title)));
  return option ?? voucherCategoryOptions[voucherCategoryOptions.length - 1];
}
