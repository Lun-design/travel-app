# UX-13B 票券面板點擊與可及性

使用者核准先限定VouchersPanel，不同時修改靈感庫與票券子表單。

- 常用入口及分類／Day選項最少44px高，短文字操作最少44px寬，保留flex-wrap防手機溢出。
- 卡片編輯、綁定、刪除可及性名稱帶入票券名稱；新增、確認及取消具明確button語義。預覽／複製／離線備用仍走原流程。
- 分類、Day及景點選擇使用radiogroup/radio與checked；已過期票券保留button切換並標明expanded與選取狀態。
- 單選項使用既有selectionKeyboardProps補RNWeb空白鍵；Enter及一般button交由原PressResponder，避免雙重觸發。綁定處理中選擇項顯示disabled，確認按鈕反映busy。
- 不修改篩選算法、API、上傳、離線檔案、預覽或綁定／刪除handler；不新增migration。全站及實機螢幕閱讀器驗收另行追蹤。

驗證：互動測試選取狀態、尺寸、目標票券modal、取消不寫入、API payload及忙碌狀態；鍵盤Space/Enter；既有票券與全量回歸、型別、build及PWA輸出。
