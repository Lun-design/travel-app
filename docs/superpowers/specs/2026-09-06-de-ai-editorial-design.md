# 去 AI 化韓系極簡視覺重構設計

## 目標

將全站從亮藍／靛紫與重陰影的預設感，轉為暖燕麥背景、深炭灰文字、低飽和暖色點綴與細邊框的現代韓系雜誌風，同時保留現有功能、暗黑模式與行動版觸控可用性。

## 現況與範圍

專案主要使用 React Native `StyleSheet`，並在少數 Web 元件使用 CSS；沒有可統一替換的 Tailwind class。高頻色彩與卡片樣式分散在首頁、登入、行程 Header/Tabs、Timeline、Expenses、Packing、Vouchers、Modal、地圖與離線提示元件。

## 視覺系統

- Light：`#F8F6F0` 背景、`#FFFDF8` 表面、`#F1EEE6` 次表面、`#1F1F1F` 文字、`#746F64` 輔助文字、`#E5E2D9` 邊框、`#9A6A45` 主色。
- Dark：`#1F1F1F` 背景、`#292824` 表面、`#35322C` 次表面、`#F8F6F0` 文字、`#C8C1B5` 輔助文字、`#514C43` 邊框、`#D5A77A` 主色。
- 警告使用低飽和琥珀／磚紅表面與文字，不再使用亮黃或螢光藍。
- 卡片以 1px 邊框與暖色塊分層；移除重度 shadow/elevation 與漸層，保留必要的圖片遮罩與 Modal backdrop。
- 互動控制最小 44px 高度／點擊區；標題使用較大字級、內文使用較高 line-height 與適度 letter spacing。

## 實作策略

1. 擴充 `lib/theme.ts` 成為唯一色彩來源，保留原有欄位名稱以降低改動風險。
2. 先替換高流量畫面與共用元件的硬編碼顏色、陰影與靛藍背景。
3. 清理 Web-only `animated-icon` 的藍色 gradient/glow，以及 PWA 的 theme/splash 色彩，使首次載入也符合新視覺。
4. 不改資料模型與互動流程；用樣式契約測試保障禁止的 gradient/shadow 與核心暖色 token。

## 驗證

- 新增視覺 token／樣式契約測試。
- 執行 `npm test`、`npm run type-check`、`npm run build`。
- 若測試只依賴 source contract，僅同步更新期望的樣式來源，不改動行為測試。
