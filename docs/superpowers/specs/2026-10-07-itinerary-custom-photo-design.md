# 景點自訂封面照片設計

## 決策

使用者已選擇讓公開分享行程的訪客也能看見自訂封面。新增公開讀取的 `itinerary-photos` Supabase Storage bucket；寫入與刪除僅授權可編輯該行程的登入者。資料庫仍以 `itinerary_items.preview_url` 為唯一持久顯示來源，不增加競爭欄位。

## 流程

景點燈箱的「更換照片」打開三個動作：網路搜尋、本機上傳、恢復預設。選擇本機照片時，由 Expo Image Picker 開啟相簿或桌面檔案選擇器；僅接受 JPG/PNG/WebP。原生裁切交給系統 picker；選擇後使用 Expo ImageManipulator 縮放與壓縮，確認輸出不超過 2 MiB。燈箱先顯示待上傳預覽，按「確認更換」才上傳。

上傳後取得公開 URL，再呼叫原有 `onUpdateImage` → `updateItineraryItemImage` 寫入 `preview_url` 並清除舊 `photo_reference`。既有父層樂觀更新、重新載入與失敗復原沿用。若上傳成功而資料庫更新失敗，刪除這次新上傳的物件；原封面維持不變。成功提示「已成功更新景點照片」。

公開分享 RPC 已回傳景點整列資料，但前端原本會在正規化時丟掉 `preview_url`，分享頁也沒有照片區。因此分享資料轉換需保留此欄位，分享卡片需渲染公開封面。

「恢復預設圖片」把 `preview_url` 設為 `null`，景點照片解析器重新使用既有的 Google Places / 精選分類圖。舊 Storage 物件不在本次操作中刪除，以避免其他已分享 URL 瞬間失效；後續可用維護工作清理孤兒檔。

## 驗證

測試格式與 2 MiB 限制、壓縮後仍過大時的阻擋、Storage 公開 URL 與上傳失敗清理、`preview_url` 寫入／清空，以及燈箱模式切換與上傳狀態。最後執行全量 Vitest 和 TypeScript 檢查。
