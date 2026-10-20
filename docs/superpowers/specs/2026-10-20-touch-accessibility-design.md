# UX-13A：打包與旅費點擊範圍／語義

2026-10-20。使用者已確認；本輪不改共用勾選含義、分帳算法、離線資料格式與登入設定。本機994項測試、TypeScript、build與verify:build全部通過；尚未提交／部署／實機驗收。

## 打包清單

- 每列保留非互動 View，內部僅一個 checkbox Pressable 包住裝飾勾選框與名稱。因此點名稱、框或兩者間空白，都沿用原 toggle(item)，沒有巢狀點擊或雙重事件。
- 指派頭像、刪除是 checkbox 的兄弟節點，不在勾選入口內，各自提供名稱與至少44×44點擊區。視覺勾選框仍28px，不用把框畫成大方塊。
- checked 對應最新item.is_checked；現有全域 mutation lock 生效時，所有列內勾選／指派／刪除的 disabled 語義與畫面一致，實際操作仍使用原同步 ref 鎖。範本／AI匯入的busy策略維持原樣，不併入本輪鎖定規則。
- 分類展開、指派選擇與常用入口補 role、label、expanded／checked／disabled；保留頭像群、篩選、匯入、重複提示與離線／樂觀更新。

## 旅費常用入口

- BudgetDashboard 預算幣別、ExpenseModal 幣別／匯率鎖定／明細按鈕、ExpenseList 編輯／結清／刪除、SettlementCard 結清／刪除紀錄，至少44×44實體區域，不只向外擴 hitSlop 而互相重疊。
- 補幣別選取狀態、分攤 checkbox 及目標明確的動作名稱；確認彈窗、金額計算及所有回呼保持原樣。小螢幕以flex-wrap維持不溢出。
- 鍵盤 Enter 沿用 React Native Pressable；審查確認RNWeb 0.21的checkbox／radio div未處理Space，因此以共用selectionKeyboardProps補web-only的Space單次選取。忽略repeat、disabled、原生互動元素及子節點冒泡，不另處理Enter／click，避免重複送出。Native無document不加DOM事件。
- 預算幣別與金額在載入／儲存期間停用，避免剛選取幣別即遭初次載入回應覆蓋；讀取與儲存API不變。

## 驗證與邊界

先測 Red 再 Green：名稱在唯一checkbox入口、指派／刪除非子節點、單擊／連點只寫一次、pending disable、樂觀狀態／回復、目標名稱／role與44px樣式。既有分帳確認、篩選、草稿及離線回歸維持通過。

此輪僅上述5個元件，不宣稱全站可及性完成；實際VoiceOver／TalkBack與手機尺寸需部署後驗收。無migration、不自動提交／部署。
