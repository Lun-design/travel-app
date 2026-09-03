# 階段二：行程管理與地圖介面設計

## 目標

在現有 Expo Router 與 Supabase 基礎上，提供行程列表、行程內頁、Day 分頁、景點 CRUD、地圖標記與路線時間軸。

## 介面架構

- 首頁採混合式列表：最近行程以卡片置頂，其餘行程以清單顯示。
- 行程內頁固定顯示 Day 1、Day 2 等水平分頁；內容區上下各半，上方為地圖，下方為時間軸。
- 時間軸依景點時間排序，沒有時間的項目排在當日最後；每個項目提供編輯與刪除操作。
- 地圖顯示當日有座標的景點 Marker，依時間順序連線 Polyline；不足兩個座標時不繪製路線。

## 景點 Modal 與地理編碼

Modal 支援新增、編輯、刪除，欄位包括名稱、地址、分類、時間、預估停留時間、步道難度、備註與座標。分類為 flight、food、spot、hotel、trail、outdoor；步道難度為 easy、moderate、hard，可僅在 trail 類型顯示。

地理編碼採用 OpenStreetMap Nominatim。只有使用者按下「搜尋」才發送請求，不在每次輸入時呼叫；請求包含 `format=jsonv2`、`limit`、`accept-language` 與明確 User-Agent。查無結果、429 或網路錯誤時保留目前資料並顯示手動定位地圖，使用者可拖曳 Marker 微調座標。

## 資料與權限

新增 migration 擴充 `itinerary_items.category` 檢查約束，加入 trail、outdoor，並加入 `duration_minutes` 與 `difficulty`。所有 CRUD 使用既有 `supabase` client；RLS 由資料庫依 trip_members 角色判定，前端不自行信任角色。

## 錯誤處理

載入、儲存或刪除失敗時顯示可理解的錯誤訊息；刪除前要求確認。Nominatim 的查無結果、節流與網路錯誤各自顯示提示。缺少座標的項目仍可出現在時間軸，但不會進入 Marker 或 Polyline。

## 測試

測試涵蓋 Nominatim 回應解析、查無結果、Day 篩選與排序、Polyline 座標順序、Modal payload 映射與欄位驗證。以 TypeScript 檢查與 Vitest 驗證純函式；地圖原生元件以資料輸入輸出測試，不在單元測試中啟動原生地圖。
