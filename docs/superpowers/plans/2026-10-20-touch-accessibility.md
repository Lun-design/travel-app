# Touch & Accessibility Implementation Plan

**Goal:** 改善打包名稱勾選、獨立操作與旅費小按鈕，保留所有既有回呼／算法。

**Architecture:** 不新增全域狀態或改API。PackingPanel只調整列的互動結構；旅費4元件只擴實體點擊區與補語義。測試操作真實元件，外部API隔離，沿用interaction harness。

**Tech Stack:** Expo55、React Native/Web、TypeScript、Vitest。

## Task 1：PackingPanel（TDD）

- [x] 在 tests/packing-filter-ui.test.ts 加入名稱包在唯一checkbox、無子按鈕、框／文字共用同一handler、指派與刪除為兄弟的測試。
- [x] 測pending更新時所有列disable／busy語義、同handler連點只update一次、樂觀checked；失敗依原load策略恢復。
- [x] 執行 npm.cmd test -- --run tests/packing-filter-ui.test.ts 確認Red。
- [x] 修改 src/components/PackingPanel.tsx：View列內新增flex1/minWidth44/minHeight44的唯一checkbox Pressable，原28px框變裝飾View；指派／刪除44px。沿用原toggle／assign／remove與mutation鎖。
- [x] 補groupHeader等可及性語義，重跑至Green。

## Task 2：旅費（TDD）

- [x] tests/expense-phase-e.test.ts 先測預算幣別44px、radio／checked、選取後原儲存幣別仍正確，以及ExpenseList三動作的44px及標籤。
- [x] tests/settlement-safety-ui.test.ts 先測結清與刪除歷史44px、具目標姓名的語義，原確認前不寫入及確認後僅寫一次維持不變。
- [x] 新增 tests/expense-modal-touch.test.ts，測幣別、鎖匯率、明細操作的實體44px、角色／選取狀態與原操作回呼。使用真實ExpenseModal，僅mock外部draft、API、版面容器。
- [x] 執行這3檔測試確認Red。
- [x] 修改 src/components/BudgetDashboard.tsx、ExpenseList.tsx、ExpenseModal.tsx、SettlementCard.tsx 的style與語義，保留所有商業函式／送出確認。
- [x] 重跑指定測試至Green及完整回歸。

## Task 3：交付

- [x] 審查發現RNWeb checkbox／radio不處理Space，先使用真實PressResponder重現0次update，再新增lib/selection-keyboard.ts及邊界測試，保留Enter原路徑與Native行為。
- [x] 獨立唯讀審查；確定缺陷先補測試重現再修正。
- [x] npm.cmd test -- --run、npm.cmd run type-check、npm.cmd run build、npm.cmd run verify:build 全數通過。
- [x] 更新UX backlog與本計畫；不宣稱實機／全站可及性驗收完成。不自動git提交、部署或操作Supabase。

## 交付證據

- 全量138檔／994項、type-check、build、verify:build全部exit 0；比上輪新增22項測試。
- 新功能與確認缺陷先Red再Green；既有測試改用可及性標籤／checked狀態取代勾選框空字串或樣式陣列形狀，背景刷新／跨行程回歸仍完整保留。
- 審查找到Space缺失及指派姓名資訊遺失，兩者均先重現再修正，獨立複核通過。預算初始載入期間停用輸入／選幣別，避免慢回應覆蓋新選擇。
- 尚需實機驗收：手機點名稱／框均單次勾選；頭像／刪除不勾選；鍵盤Tab＋Space／Enter可操作；原結清／刪除仍先確認；VoiceOver／TalkBack讀出對象與狀態。
- AI／範本busy策略、金融算法、AuthGate及離線API保持原樣，沒有Supabase migration。未提交／部署。
