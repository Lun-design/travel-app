# UX-12A：登入操作與免驗證信註冊

日期：2026-10-20。使用者已確認，並明確要求保留測試帳號提示、不使用驗證信。前端本機驗證完成（972 項測試、TypeScript、build、verify:build）。尚未提交／部署／實機驗收，Confirm email 後台設定未操作或查證。

## 範圍與安全邊界

- 保留現有測試帳號提示（包含正式版），密碼預設隱藏，可切換顯示；切換登入／註冊時重新隱藏。
- 登入／註冊共享同步 ref 鎖；送出期間停用提交、模式切換及輸入，防止同一畫面多筆請求及回應錯置；卸載後不導頁、不更新 UI。
- Email trim 並檢查基本格式；密碼不 trim 或正規化。登入不新增最短長度限制，避免擋住舊帳密；註冊至少六碼，其餘密碼政策沿用 Supabase。
- Web／手機瀏覽器／PWA 的 navigator.onLine=false 時在 API 前阻擋並顯示清楚提示，恢復連線後可手動重試；失敗保留輸入及釋放鎖。原生 iOS／Android 尚未加入獨立網路狀態套件，只保留 API 失敗提示，不聲稱具備同等離線零請求保證。
- 保留首頁及分享頁登入後導回。只有 Auth API 真正回傳 session 才導頁；無 session 不偽裝成功。
- 移除登入 UI 的驗證信說明及重寄入口；保留 lib/auth-api.ts 既有函式，避免無關 API 相容性變動。
- Supabase Confirm email 必須由管理員在後台關閉。此項是外部待辦，不聲稱已完成；前端無權關閉，且不修改 AuthGate、RLS 或以 anon/service-role 金鑰繞過驗證。
- 無 session 時提示「未取得登入工作階段，請聯絡管理員確認註冊設定或返回登入」，不要求使用者收驗證信。
- 未加入忘記密碼，因重設流程需完整 recovery route 與 redirect 設定；後續獨立規格。

## 驗收

TDD 驗證顯示切換與模式重設、提示保留、空白／Email／短註冊密碼不發 API、合法舊密碼可登入、防連點（同一 callback 連呼兩次）、離線零 API、錯誤可重試、success/no-session/unmount 及分享頁導回。全量 test、type-check、build、verify:build；不自動提交／部署或修改雲端認證設定。
