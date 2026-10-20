# Timezone Region Picker Implementation Plan

**Goal:** 以中文地區選單取代手填 IANA，保留自訂值及所有原時間資料。

**Architecture:** lib/timezone-options.ts 提供純對照與安全目的地建議；共用 TimezonePickerField 接受 value/onChange/disabled/theme，兩個既有 Modal 保持原儲存回呼。無新套件、無 migration。

**Tech Stack:** Expo SDK 55、React Native/Web、TypeScript、Vitest。

### 1. 純資料與元件（TDD）

- [x] 新增 tests/timezone-region-picker.test.ts，先測 options 各 value 通過 isValidTimezone，台灣／日本／韓國對照與美國城市分列。
- [x] 測 detectTravelTimezone('美國 洛杉磯') === 'America/Los_Angeles'；'美國' 與空白回 null，不擅自採紐約。
- [x] 測 Web select.onChange 更新 IANA；其他／進階不呼叫 onChange，原有 Australia/Adelaide 保留；Native 選擇與 disabled 生效。
- [x] 執行 npm.cmd test -- --run tests/timezone-region-picker.test.ts 確認 Red。
- [x] 建立 lib/timezone-options.ts（options 與 detectTravelTimezone），及 src/components/TimezonePickerField.tsx；選項直接回傳 IANA，進階維持父 value；無法判定時只提示不回寫。
- [x] 重跑同指令至 Green。

### 2. 表單整合（TDD）

- [x] 新增 tests/timezone-modal-integration.test.ts，呼叫共用欄位 onChange('Asia/Tokyo')，確認原 onSave／onCreate／onUpdate 收到 timezone，日期與 default_departure_time 不變。
- [x] 測取消不寫入、無效 IANA 不儲存、既有非清單值原樣儲存、修改目的地不變更時區。
- [x] 執行指定測試確認 Red，再將兩個 Modal 的 IANA TextInput 改為 TimezonePickerField；保留所有其他功能，長表單使用 ScrollView。
- [x] 重跑新增測試及既有 time-date-picker、timezone、home-trip-actions、notifications 回歸。

### 3. 檢查與交付

- [x] 唯讀獨立審查，確認的缺陷先補失敗測試再修正。
- [x] npm.cmd test -- --run、npm.cmd run type-check、npm.cmd run build、npm.cmd run verify:build 全數通過。
- [x] 更新 UX backlog 與本計畫。保留工作區給使用者自行 git 提交，不自動部署。

## 驗證紀錄

- 兩個表單的 4 項新整合測試先失敗（共用欄位未接入）再通過；地區資料與元件新增 12 項測試。
- 獨立審查找到同名城市跨國誤判及 Native 選單第一下點擊收起鍵盤，已用 2 項失敗測試重現並修正，複核通過。
- 全量 135 檔／957 項、npm.cmd run type-check、npm.cmd run build、npm.cmd run verify:build 全部 exit 0。
- 未變更原景點時間、舊 inference helper、DB schema、雲端同步及儲存 API。無 migration；不自動提交／部署。
