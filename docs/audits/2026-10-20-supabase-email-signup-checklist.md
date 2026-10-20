# 免驗證信註冊：Supabase 設定與驗收

狀態：前端已配合調整；後台開關未由本次程式修改操作或查證。這不是 migration，不應以 SQL 修改 auth.users 或放寬 RLS 代替。

## 管理員操作

1. 開啟實際部署環境所使用的 Supabase 專案，進入 Authentication → Sign In / Providers → Email。
2. 保留 Email 登入啟用；將 **Confirm email** 關閉並儲存。若要接受新註冊，也確認 Allow new users to sign up 已開啟。
3. 不開啟匿名登入、不更換 API Key、不修改 Session 或 RLS 保護，也不把 service-role Key 放入前端。
4. 關閉 Email 確認後，應以新且可使用的 Email 測試註冊能取得 session；不要以公開的測試範例帳號測註冊，以免與既有帳號衝突。

官方說明：[Supabase Auth General configuration](https://supabase.com/docs/guides/auth/general-configuration)。Confirm Email 關閉時，不需先證明 Email 所有權即可登入，系統會自動確認 Email；因此需接受拼錯／冒用 Email 與垃圾帳號風險，仍應保留服務端密碼政策與速率限制。這項選擇不代表使用者信箱經過驗證。

## 線上驗收（手機及桌面）

- 使用既有帳號登入，原行程及分享頁登入後導回正常。
- 新帳號註冊後直接登入，不出現確認信步驟；沒有 session 時畫面不可偽裝登入成功。
- 若仍收驗證信或沒有 session：確認改的是同一個 Supabase 專案及 Email provider，請管理員檢查設定與 Auth 日誌；前端無法替遠端設定背書。
- 曾經尚未確認的舊帳號另外實測。若無法登入，由管理員核對個別帳號狀態；不要批次更新 auth.users 或假造 session。
- 密碼預設隱藏，顯示／隱藏不改字串；切到註冊或登入模式會重新隱藏。測試帳號提示仍可見。
- 快速連點僅送出一筆，錯誤後可再次提交；離線有提示，恢復連線後可重試。

## 回復政策

若將來管理員重新開啟 Confirm email，需同步規劃恢復驗證信 UI 及未確認帳號引導；本輪已依使用者要求移除重寄入口。不要只切開關後假設前端流程仍完整。

本機自動化測試不會操作真實 Supabase Auth、不寄信、不建立帳號，不等同以上實機驗收已完成。
