# 專案健康檢查報告 — 2026-10-07

## 範圍

靜態檢視 React effects/timers/listeners、非同步資料流、Places 搜尋分頁、Supabase realtime、離線同步、資料解析/型別邊界與常用核心純函式；並以 Vitest 做競態與極端值回歸測試。

## 發現與處置

| 嚴重度 | 發現 | 處置 |
| --- | --- | --- |
| High | 同一行程的離線同步若重疊執行，可能同時重播同一筆跨天搬移；若同步期間新增 mutation，重疊呼叫又被合併後，新 mutation 可能留在佇列等下一次網路事件。 | 以 user/trip scope 合併同步、串行處理；重疊期間收到新同步要求時，在當前批次結束後再掃一次。新增兩項 concurrency 測試：同筆 mutation 不重播、期間新增 mutation 會被處理。 |
| High | 全球推薦分頁請求未綁定搜尋世代；切換地區/主題後，舊的慢回應仍可能覆蓋新清單。快速連點也可能重複發出同頁請求。 | 對分頁採 request generation 與每世代 in-flight guard；舊回應、錯誤與 finally 均不再修改新世代 state。切換地區/主題/細分類或關閉面板時同步失效舊請求並清除 loading。 |
| Medium | realtime 結清紀錄多次刷新可亂序完成，較舊的回應可能覆蓋較新的結清狀態。 | 初次載入與 realtime 更新共用 request generation；只有最新請求且元件仍有效時才能寫入 state。 |
| Medium | 行程儲存後的零延遲捲動，以及結清/分享成功提示 timer 未清理，元件快速卸載時可能執行過期 callback。 | 以 ref 保存 timer、重設時清除舊 timer，並在卸載 cleanup 清除。 |
| Medium | 行程路線估算非同步 pipeline 若座標補全/路線估算意外 reject，可能成為未處理 rejection 並讓估算狀態卡住。 | 加上 pipeline catch、合理 fallback 路段與錯誤紀錄，確保 loading 可結束。 |
| Medium | PWA 手動/定期 service worker 更新的 Promise 原本未處理 rejection。 | 捕捉更新失敗並記錄警告；註冊錯誤已有處理。 |
| Medium | 登出錯誤回傳時仍可能先清除本地資料並繼續導頁，造成使用者以為已登出但伺服器 session 尚在。 | 先確認 sign-out 成功，再清理本地狀態；失敗時保留資料並顯示提示。 |
| Medium | 票券預覽開啟外部 URL 的 Promise reject 可能未捕捉。 | 加入錯誤提示，不讓 rejection 漏出。 |
| Medium | 公開行程頁在存在 Day 2+、但沒有 Day 1 資料時會錯誤選到 Day 1。 | 新增 `firstTripDayNumber`，依實際可用日數選最早的一天。 |

## 極端值與邊界測試

- 閏日、跨年、無效/反向日期：以 UTC 日曆運算驗證，避免本地時區偏移。
- 空支出/空成員、零預算、零或負數結清紀錄：驗證不產生 NaN 或無效轉帳。
- 負數、零與非有限費用總額：分攤 helper 必須拒絕。
- 超長景點名稱：地圖 marker 建立仍保留原字串且不崩潰。
- 額外覆蓋搜尋請求失效、重疊離線同步、realtime teardown、路線估算 reject 與 timer cleanup。

## 尚未確認為 Bug 的觀察

- 行程時間軸按單日資料量直接渲染，沒有列表虛擬化；首頁行程清單已使用 `FlatList`。目前沒有量測證據顯示單日列表造成可感知卡頓，因此未在本次做高風險結構改寫。若單日資料可能達數百筆，建議後續以真機 profiler 壓測後再採用虛擬列表。
- 靜態掃描發現部分 API 邊界使用型別斷言或非空斷言；本次逐一檢查了與本報告資料流相關的 JSON/storage/日期/分攤路徑，未看到需以全面改型別方式處理的已重現缺陷。未做無差別 `as` / `any` 重寫，以免擴大風險。

## TDD 與驗證

本次所有修正均先加入可重現測試並確認 Red，再實作後確認 Green。最終結果：`npm test -- --run` — 101 個測試檔、677 個測試全數通過；`npm run type-check` — 通過。
