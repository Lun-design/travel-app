# 使用者互動與按鈕稽核（2026-10-07）

## 掃描範圍與方法

- 靜態掃描 `src/` 全部頁面、模組與卡片的 `onPress`、`onClick`、`TouchableOpacity`。
- 檢查提交/刪除/上傳/結清/邀請等高風險非同步互動的 loading、disabled、驗證與錯誤處理；另檢查搜尋、跨天移動、複製、導航與離線同步入口。
- 掃描無操作 handler、未處理 Promise 與靜默吞錯；以 Vitest 合約回歸測試驗證已修正互動。
- 這是靜態與單元層級稽核，未對每個真實登入角色、瀏覽器/手機或斷網情境執行人工 E2E 點擊測試。

## 入口清單

掃描到 **194 個 `onPress` 入口，分布於 44 個檔案**；另外 **2 個 Web `onClick`**（皆為原生日期/時間 picker 觸發器，位於 `FormPickers.tsx`）。沒有掃到 `TouchableOpacity`，也未發現空函式/空值形式的明顯死按鈕。

| 頁面/模組 | 檔案（入口數） |
| --- | --- |
| 首頁 / 登入 / 分享頁 / 行程頁 | `app/index.tsx` (1), `app/login.tsx` (3), `app/share/[token].tsx` (2), `app/trips/[id].tsx` (1) |
| 行程總覽 / 預算 / 成員 | `BudgetDashboard.tsx` (2), `CreateTripModal.tsx` (3), `DayTabs.tsx` (1), `InviteTripModal.tsx` (1), `ShareTripModal.tsx` (4), `TripSettingsModal.tsx` (3), `UserProfileModal.tsx` (4), `trip-detail/TripDetailHeader.tsx` (6), `trip-detail/TripDetailTabs.tsx` (1) |
| 行程時間軸 / 景點 / 地圖 / 匯入匯出 | `ItineraryTimeline.native.tsx` (1), `ItineraryTimeline.shared.tsx` (25), `ItineraryTimeline.web.tsx` (1), `trip-detail/TimelinePanel.tsx` (9), `ItineraryImportModal.tsx` (9), `ItineraryItemModal.tsx` (12), `ItineraryCardExport.tsx` (3), `RouteOptimizeModal.tsx` (5), `TodayFocusCard.tsx` (7), `TripPlacesPanel.tsx` (7), `TripMap.native.tsx` (1), `RecommendationPanel.tsx` (12) |
| 費用 / 分帳 | `ExpenseList.tsx` (3), `ExpenseModal.tsx` (9), `trip-detail/ExpensesPanel.tsx` (1), `SettlementCard.tsx` (6), `ReceiptScanButton.tsx` (1) |
| 憑證 / 文件 | `DocumentPreviewModal.tsx` (1), `DocumentsPanel.tsx` (3), `DocumentUploadModal.tsx` (1), `external-link.tsx` (1), `VoucherMetadataModal.tsx` (3), `VoucherPreviewModal.tsx` (2), `VoucherUploadModal.tsx` (4), `VouchersPanel.tsx` (10) |
| 打包 / UI 控制 / 其他 | `FormPickers.tsx` (6), `OfflineRescueCardModal.tsx` (2), `OfflineSyncBanner.tsx` (2), `OpeningHoursEditor.tsx` (6), `PackingPanel.tsx` (8), `ui/collapsible.tsx` (1) |

## 確認問題與修復

| 嚴重度 | 問題 | 修復與測試 |
| --- | --- | --- |
| Medium | 文件預覽「在新視窗開啟」的 `Linking.openURL` rejection 未捕捉；裝置無法開啟時點擊看似無反應。 | 加入 `Alert` 錯誤提示；`tests/documents.test.ts` 先 Red 後 Green。 |
| Medium | 行程卡與今日焦點的 Google Maps 開啟失敗被 `.catch(() => undefined)` 靜默吞掉。 | 顯示「無法開啟導航」提示；`tests/user-interaction-audit.test.ts` 先 Red 後 Green。 |
| Medium | 原生外部連結呼叫 `openBrowserAsync` 未處理拒絕。 | 捕捉錯誤並顯示提示；同一互動回歸測試先 Red 後 Green。 |
| Low | 邀請碼複製遇到 Clipboard API 拒絕時會產生未處理 rejection。 | 加入複製失敗提示，並保留無剪貼簿時顯示邀請碼的 fallback；同一互動回歸測試先 Red 後 Green。 |

## 其他檢查結果

- 未找到明顯的空 `onPress` / `onClick`，常用提交入口均有 handler。
- 表單檢查確認：建立行程會驗證必填、日期先後、時間與時區；旅費會驗證標題、正數金額、付款人、分攤成員與明細數值。建立/儲存/上傳/排序/綁定等主要非同步操作普遍有 busy/loading 與 disabled。
- 預算儲存、登入/註冊、票券/文件上傳、結清、邀請與同步流程有錯誤處理；搜尋字串由文字欄位送入，不以 HTML 插入 UI。
- 未發現列表末項/空陣列會直接對 index 做無保護刪除或移動的明顯按鈕缺陷；時間軸首末移動項有 disabled 狀態。
- 未發現任何 UI 能保證每個操作在完全離線時成功：需連線的操作以錯誤提示/待同步狀態處理；跨天搬移與多數編輯依專案既有離線佇列/樂觀流程。此輪未做實機網路節流 E2E。
- `ExpenseModal` 必填/金額驗證可避免空白標題、0 與負數提交；主要儲存按鈕在 saving 時 disabled。

## 後續風險/限制

此掃描不等同於在每個平台逐一手動點擊 194 個控制項。建議 CI 後續加入 Playwright/Webdriver 的關鍵路徑 smoke tests（登入、建立行程、編輯/刪除景點、跨天移動、費用新增、憑證上傳、離線恢復），並在 staging 用慢網路與離線模式跑一次。
