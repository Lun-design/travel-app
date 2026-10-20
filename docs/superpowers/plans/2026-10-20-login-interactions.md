# Login Interaction Safety Implementation Plan

**Goal:** 改善登入操作，保留測試提示，配合管理員關閉 Confirm email 後的免驗證信註冊。

**Architecture:** 只修改 src/app/login.tsx 的表單與事件，保留 lib/auth-api.ts、AuthGate、分享頁路由與資料層。同步 ref 鎖與 mounted ref 保護非同步回應；不新增密碼儲存或草稿。

**Tech Stack:** Expo SDK 55、React Native/Web、Supabase Auth、TypeScript、Vitest。

## Tasks

- [x] 新增 tests/login-interactions.test.ts，用既有 interaction harness 操作真實 LoginScreen；API／router 僅以 mock 隔離外部行為。
- [x] 先驗證失敗：密碼預設 secureTextEntry=true，點「顯示密碼」後false，切模式後true；測試帳號提示仍存在。
- [x] 先驗證失敗：空白欄位、無效 Email、註冊少於6碼及offline不得呼叫signIn/signUp；舊短登入密碼不阻擋；送出密碼原字串不改寫。
- [x] 先驗證失敗：同一onPress連呼兩次只發1筆；pending所有API入口disabled；失敗後可再提交；卸載後不得router.replace。
- [x] 測試 /share/:token 原路導回、其他 redirect 回首頁、註冊有session直接導回、無session不導頁且不顯示驗證信／重寄入口。
- [x] 執行 npm.cmd test -- --run tests/login-interactions.test.ts 確認 Red。
- [x] 修改 src/app/login.tsx：useRef忙碌鎖、useEffect清理、showPassword與toggle，submit先驗證與offline guard再鎖定；成功僅session導回；finally在mounted時清loading，無論成功失敗釋放lock。
- [x] 表單包ScrollView與KeyboardAvoidingView，手機能捲至操作按鈕；所有新增點擊範圍44px、提示live region。
- [x] 重跑新測試與tests/auth.test.ts、tests/supabase-auth-recovery.test.ts；獨立唯讀審查後針對確定缺陷TDD修正。
- [x] 全量 npm.cmd test -- --run、npm.cmd run type-check、npm.cmd run build、npm.cmd run verify:build。
- [x] 更新backlog與Supabase設定操作說明；Confirm email仍需使用者後台操作與實機驗收。無migration，不自動git提交／部署。

## 本機交付紀錄

- 原先新增13項互動／回歸測試，其中10項預期失敗，修正後通過；另補2項網路及確認政策錯誤分支覆蓋，共15項。
- 全量136檔／972項、npm.cmd run type-check、npm.cmd run build、npm.cmd run verify:build 全數 exit 0；獨立唯讀審查未發現確定 Critical／Important。
- 原生 iOS／Android 未承諾與 Web/PWA 相同的 navigator.onLine 預阻擋能力；未加網路狀態套件。
- 分享導回沿用原路由；實際 AuthGate／Supabase 事件排程需線上驗收，不因單元測試就宣稱跨裝置實機成功。本次未擴大變更 AuthGate。
- 外部設定與新／舊帳號驗收依 docs/audits/2026-10-20-supabase-email-signup-checklist.md；尚未操作雲端開關、提交或部署。
