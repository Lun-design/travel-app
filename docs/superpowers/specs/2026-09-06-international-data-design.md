# 第二階段：時區、動態匯率與預報來源設計

## 目標

讓跨國行程的日期/營業時間、分帳匯率與天氣提示都有可追溯的來源與安全 fallback。

## 設計

### 目的地時區

`trips.timezone` 使用 IANA 時區字串，預設 `Asia/Taipei`。`lib/timezone.ts` 集中驗證與格式化，透過 `Intl.DateTimeFormat` 取得目的地的日期與星期，不在各 UI 元件自行呼叫 `new Date('YYYY-MM-DD')`。時間軸的 `ScheduleContext` 傳入行程時區，營業時間比對使用目的地當地日期；無效或缺漏時安全降級到 `Asia/Taipei`。

行程設定 Modal 提供時區輸入/選擇，建立行程也可指定時區；既有資料由 Migration 自動填入預設值。

### 動態匯率

`lib/exchange-rates.ts` 保留既有純函式與預設匯率，新增 `ExchangeRateSnapshot` 與 `createExchangeRateService`。Service 從公開匯率 endpoint 讀取 TWD 基準匯率，將回傳值正規化成「一單位外幣換算 TWD」，並依序使用：手動鎖定 > 記憶體/LocalStorage 快取 > 線上 live > 預設值。快取包含 `updatedAt` 與 `source`，不把錯誤或私密資料寫入 Service Worker。

分帳頁顯示「匯率來源／最後更新時間」，可為目前幣別輸入並鎖定自訂匯率；離線或 API 失敗時保留最後快取並標示來源。

### 天氣來源標籤

`WeatherSummary` 增加 `source: 'live' | 'cached' | 'mock'` 與 `isSimulated`。Open-Meteo 回傳有效日期時標示 `live`；日期超出預報、解析失敗或網路錯誤時使用現有穩定 mock 並標示 `mock`。時間軸卡片顯示「模擬預報」或「即時預報」來源文字，避免把填補資料誤認為當天實況。

## 錯誤處理與相容性

- 不移除既有欄位與既有預設匯率；舊資料缺少 timezone/source 時由 TypeScript normalization 補值。
- 所有網路服務接受注入 fetch，測試完全 mock，不連外網。
- Web SSR/Expo static export 不在 module top-level 讀取 `window`、`localStorage` 或 `navigator`。

## 測試

- `tests/timezone.test.ts`：IANA 驗證、跨日格式化、weekday 與 fallback。
- `tests/exchange-rates.test.ts`：live 解析、快取、手動鎖定、API/離線 fallback。
- `tests/weather.test.ts`：source/isSimulated 與 mock 標籤。
- `tests/security-migration.test.ts`：timezone migration contract。
- 完成後跑 Vitest、`tsc --noEmit` 與 Expo web export。
