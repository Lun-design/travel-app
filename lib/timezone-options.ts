/** Region labels are not UTC offsets: IANA retains daylight-saving rules. */
export const TIMEZONE_REGIONS = [
  { value: 'Asia/Taipei', label: '台灣／台北', keywords: ['台灣', '臺灣', '台北', '臺北', 'taiwan', 'taipei'] },
  { value: 'Asia/Tokyo', label: '日本／東京', keywords: ['日本', '東京', '大阪', '京都', '沖繩', 'japan', 'tokyo', 'osaka', 'kyoto', 'okinawa'] },
  { value: 'Asia/Seoul', label: '韓國／首爾', keywords: ['韓國', '首爾', '釜山', 'korea', 'seoul', 'busan'] },
  { value: 'Asia/Hong_Kong', label: '香港', keywords: ['香港', 'hong kong'] },
  { value: 'Asia/Singapore', label: '新加坡', keywords: ['新加坡', 'singapore'] },
  { value: 'Asia/Bangkok', label: '泰國／曼谷', keywords: ['泰國', '曼谷', 'thailand', 'bangkok'] },
  { value: 'Asia/Shanghai', label: '中國／上海', keywords: ['上海', '北京', 'shanghai', 'beijing'] },
  { value: 'Europe/London', label: '英國／倫敦', keywords: ['倫敦', 'london'] },
  { value: 'Europe/Paris', label: '法國／巴黎', keywords: ['巴黎', 'paris'] },
  { value: 'Europe/Berlin', label: '德國／柏林', keywords: ['柏林', 'berlin'] },
  { value: 'America/New_York', label: '美國／紐約', keywords: ['紐約', 'new york'] },
  { value: 'America/Los_Angeles', label: '美國／洛杉磯', keywords: ['洛杉磯', 'los angeles'] },
  { value: 'Pacific/Honolulu', label: '美國／檀香山（夏威夷）', keywords: ['檀香山', '夏威夷', 'honolulu', 'hawaii'] },
  { value: 'Australia/Sydney', label: '澳洲／雪梨', keywords: ['雪梨', '悉尼', 'sydney'] },
] as const;

const REGION_COUNTRIES: Record<string, readonly string[]> = {
  'Asia/Taipei': ['台灣', '臺灣', 'taiwan', 'tw'],
  'Asia/Tokyo': ['日本', 'japan', 'jp'],
  'Asia/Seoul': ['韓國', '南韓', 'south korea', 'korea', 'kr'],
  'Asia/Hong_Kong': ['香港', 'hong kong', 'hk'],
  'Asia/Singapore': ['新加坡', 'singapore', 'sg'],
  'Asia/Bangkok': ['泰國', 'thailand', 'th'],
  'Asia/Shanghai': ['中國', '中国', 'china', 'cn'],
  'Europe/London': ['英國', '英国', 'united kingdom', 'uk', 'gb'],
  'Europe/Paris': ['法國', '法国', 'france', 'fr'],
  'Europe/Berlin': ['德國', '德国', 'germany', 'de'],
  'America/New_York': ['美國', '美国', 'united states', 'usa', 'us'],
  'America/Los_Angeles': ['美國', '美国', 'united states', 'usa', 'us'],
  'Pacific/Honolulu': ['美國', '美国', 'united states', 'usa', 'us'],
  'Australia/Sydney': ['澳洲', '澳大利亞', 'australia', 'au'],
};

function keywordPattern(keyword: string, global = false) {
  return new RegExp(/^[a-z ]+$/.test(keyword) ? `\\b${keyword}\\b` : keyword, global ? 'gi' : 'i');
}

/** Suggest only when exactly one supported region is identified; never guess a country-wide zone. */
export function detectTravelTimezone(destination: string | null | undefined): string | null {
  const text = destination?.trim().toLowerCase() ?? '';
  if (!text) return null;
  const matches = TIMEZONE_REGIONS.filter(region => region.keywords.some(keyword =>
    keywordPattern(keyword).test(text),
  ));
  if (matches.length !== 1) return null;
  const region = matches[0];
  // A city keyword alone is insufficient when the rest of the destination
  // contains an unrecognized country/region (e.g. London, Canada). Be
  // conservative: only accept supported city/country words and neutral trip
  // descriptors. Unknown detail is a manual-selection case, not a geocoder.
  const allowed = [...region.keywords, ...REGION_COUNTRIES[region.value], '自由行', '旅遊', '旅行', '行程', '之旅', 'trip', 'travel'];
  let remaining = text;
  for (const keyword of allowed.sort((a, b) => b.length - a.length)) remaining = remaining.replace(keywordPattern(keyword, true), ' ');
  return /\p{L}/u.test(remaining) ? null : region.value;
}
