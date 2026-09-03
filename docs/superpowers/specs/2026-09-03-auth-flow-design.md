# Supabase Email 登入／註冊與 Auth Gate 設計

## 目標

讓未登入使用者自動進入登入頁；登入成功後進入行程首頁；同時支援 Supabase 關閉或開啟 Email confirmation 的兩種設定。

## 畫面與流程

- `src/app/login.tsx` 提供登入與註冊模式切換、Email、密碼、送出、測試帳號提示與錯誤訊息。
- 註冊成功且 Supabase 未要求驗證時，若回傳 session，立即導向 `/`。
- 註冊成功但沒有 session 時，顯示「請至信箱點擊驗證連結」，並提供重新發送驗證信按鈕。
- 登入後若 `user.email_confirmed_at` 不存在，仍停留登入頁並顯示驗證提示；可重新發送驗證信。
- 已驗證或不需驗證的登入使用者使用 `router.replace('/')` 進入首頁。
- 首頁提供登出按鈕，登出後由 Auth Gate 導向登入頁。

## Auth Gate

根佈局透過 `supabase.auth.getSession()` 取得初始狀態，並以 `onAuthStateChange` 更新狀態。載入期間顯示 loading；未登入時使用 replace 導向 login。驗證狀態由 Supabase user metadata 判定，不在前端自行繞過 RLS。

## 錯誤與測試

錯誤訊息轉為中文，涵蓋登入失敗、Email 已註冊、驗證信寄送失敗與網路錯誤。純函式測試覆蓋錯誤映射與「有 session／無 session」註冊結果分類；TypeScript 與 Expo Web export 驗證頁面可被 bundler 載入。

測試帳號提示使用 `traveler.test@example.com` 與 `TravelTest123!` 作為範例，並提醒若已註冊需換用唯一信箱。
