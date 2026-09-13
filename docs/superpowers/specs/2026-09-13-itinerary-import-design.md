# 一鍵匯入行程設計規格

## 目標

讓使用者以一次操作將簡訊、Email、AI 整理文字或 `.ics` 行事曆匯入行程。解析器必須是格式通用的，不依賴特定城市、景點或語言；大阪行程僅作為驗證範例。

## 使用流程

1. 使用者開啟「一鍵匯入行程」Modal。
2. 選擇「貼上文字」或「上傳 `.ics`」。
3. 系統辨識來源並產生標準化匯入草稿。
4. 使用者選擇目標行程：目前行程、其他既有行程或建立新行程。
5. 合併既有行程時選擇來源日期對應方式：依來源日期合併，或從指定 Day 開始匯入。
6. 顯示新增、重複、缺少時間／地址及可能需要人工確認的項目。
7. 使用者確認後批次寫入，完成後重新載入 Timeline、Weather、Packing 與衝突提示。

## 標準資料契約

所有來源都轉為同一個 `ImportedTripDraft`：

```ts
type ImportedTripDraft = {
  title?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  days: Array<{
    dayNumber: number;
    date?: string;
    label?: string;
    items: Array<{
      title: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      startTime?: string;
      durationMinutes?: number;
      category?: string;
      notes?: string;
    }>;
  }>;
  warnings: string[];
};
```

日期區間會以曆法日計算完整 Day 數。只有部分日期時補齊中間天數；沒有日期的項目保留原始順序，並由使用者指定起始 Day。沒有明確時間的項目不擅自猜測精確時間，只標示為待確認或交由既有排程 fallback 處理。

## 來源解析

### 純文字（A／C）

- 共用既有航班與自然語言解析能力，再由通用 Markdown／條列解析器處理標題、日期、時間區間、地點與備註。
- 支援西元、月／日、不同分隔符、全形標點、中文或英文星期、任意城市與景點名稱。
- 時間區間如 `10:30～12:00` 會計算停留分鐘；「上午、下午、晚上、約」只作為語意提示，不綁定大阪等特定地名。
- 粗體、項目符號、反斜線、Markdown 標記先正規化，避免格式差異影響解析。

### `.ics`（B）

- 解析 `VEVENT` 的 `SUMMARY`、`DESCRIPTION`、`LOCATION`、`DTSTART`、`DTEND`、`TZID`。
- 支援含時區的 DTSTART、全天事件與跨日事件；全天事件保留為當日項目，不生成虛假的開始時間。
- 無效或重複 UID 會列入警告，不阻斷其他事件匯入。

## 合併與寫入

- 目標行程由使用者明確選擇；預設選目前開啟的行程，但不自動覆蓋資料。
- 去重鍵為「日期 + 標準化景點名稱 + 開始時間」，地址僅作輔助比對。
- 新增、跳過重複與需要確認的資料在預覽階段分組呈現。
- 確認後使用既有 Supabase API 批次新增；錯誤需回報具體項目，並在完成後觸發 parent reload/refetch。
- 地址與座標補齊屬非阻塞工作，保留使用者提供的中文地址，避免被外部 Details API 覆蓋。

## 元件與模組邊界

- `lib/itinerary-import.ts`：來源辨識、標準契約、日期／Day 對應、合併與去重。
- `lib/ics-import.ts`：ICS tokenizer 與事件轉換。
- `lib/markdown-itinerary-parser.ts`：通用文字與 Markdown 結構解析。
- `src/components/ItineraryImportModal.tsx`：來源選擇、目標行程、日期映射、預覽、確認與錯誤狀態。

Weather、Packing、Recommendation、分帳及現有 AI Parser 核心邏輯不改寫，只透過匯入完成後的既有 reload／callback 串接。

## 錯誤與安全

- 空白內容、無法辨識的日期或沒有任何事件時，顯示可理解的修正提示。
- 匯入採預覽後確認，不執行靜默批次寫入。
- 外部地點查詢失敗不阻斷匯入；景點仍可用名稱與原始地址建立。
- 不在瀏覽器端執行任意 HTML；Markdown 僅視為純文字解析。

## TDD 驗證範圍

- 任意城市的日期區間與 Day 數補齊。
- 中文、英文、全形標點與 Markdown 條列解析。
- 時間區間、航班、全天事件與跨日 ICS 事件。
- 目標行程日期映射、去重與 safe payload。
- 缺少地址／時間的 fallback 與警告。
- 匯入確認後 reload callback 及錯誤回報。

## 非本階段範圍

- 不自動替使用者購票、訂房或修改外部行事曆。
- 不要求外部 AI 服務；先以可測試的本地解析完成核心流程。
- PDF／圖片匯出維持現有功能，不與匯入流程耦合。
