# 行程時間與營業時間碰撞預警系統規格

## 目標

在行程時間軸中加入可測試的每日排程推算與營業時間碰撞預警，讓使用者在景點卡片上即時看見可能的公休、關門與時間重疊問題。

## 資料模型

- `public.trips.default_departure_time time`：行程層級每日出發時間，可為 `null`；計算時回退至 `09:00`。
- `public.itinerary_items.duration_minutes integer`：建議停留分鐘數；既有 `null` 值在排程計算時視為 60 分鐘。
- `public.itinerary_items.opening_hours jsonb`：每週營業時段。鍵值為 `monday` 至 `sunday`，值為 `{ closed: boolean, periods: [{ open: "HH:mm", close: "HH:mm" }] }`。`periods` 可有多筆；`close` 小於或等於 `open` 表示跨午夜。未設定或 `null` 表示不做營業時間預警。

Migration 使用 `if not exists` 與安全預設，既有資料不需回填營業時間；現有 `duration_minutes` 欄位保持相容。

## 純邏輯排程引擎

新增 `lib/schedule.ts`，只接收行程基本日期、每日出發時間、依 `position` 排序的景點與既有路段交通估算結果，輸出每站：

- `scheduledStart`：使用者明確填寫的時間，或依規則推算的時間。
- `arrivalTime`：預計抵達時間；第一站等於開始時間，後續站為上一站開始時間加停留與前段車程。
- `departureTime`：抵達時間加停留分鐘數。
- `openingWarning`：抵達時為公休或不在營業時段。
- `overlapWarning`：明確排定的開始時間早於前一站完成移動的最早可抵達時間。

第一站時間優先順序為景點明確時間、行程 `default_departure_time`、`09:00`。後續景點若有明確時間則保留該時間並檢查重疊；沒有明確時間則使用最早可抵達時間。日期以旅程開始日期加 `day_number - 1` 計算，使用 UTC 日期解析避免時區偏移。

## UI 與資料流

- 行程設定 Modal 增加 `default_departure_time` 欄位，透過既有 trips API 保存。
- 景點 Modal 的進階區新增每週營業時段編輯器，支援公休、多時段與跨午夜。
- `ItineraryTimeline` 在產生卡片前呼叫排程引擎，傳入行程起始日期與每日出發時間。
- 卡片顯示推算後的抵達/開始時間；`openingWarning` 顯示黃色 `⚠️ 抵達時景點可能已休息`，`overlapWarning` 顯示紅色 `❌ 行程時間重疊`。
- 景點排序、刪除與儲存後重新計算；既有地圖 Marker、Polyline 與路段距離資料流維持不變。

## 測試策略

在實作前新增純函式測試，涵蓋：

1. 第一站使用景點時間、行程出發時間與 `09:00` 回退。
2. 後續站依停留時間與 Haversine 車程推算。
3. 明確時間早於可抵達時間時產生重疊警告。
4. 週期營業時段、休息時段、公休、多時段與跨午夜判斷。
5. `duration_minutes: null` 以 60 分鐘計算。

完成後執行 `npm test` 與 `npx tsc --noEmit`。
