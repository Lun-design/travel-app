# 去 AI 化韓系極簡視覺重構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將旅遊 PWA 的全域視覺調整為暖燕麥、深炭灰、細邊框的韓系極簡雜誌風，同時保留現有功能與跨平台版面。

**Architecture:** 以 `lib/theme.ts` 提供 light/dark token，先更新行程頁與高流量共用元件，再清理 Web/PWA 的藍色 gradient/glow。樣式契約測試只檢查禁止的視覺模式與核心 token，避免綁死元件實作。

**Tech Stack:** Expo Router 55、React Native StyleSheet、Web CSS、Vitest、TypeScript。

---

### Task 1: Establish editorial theme tokens

**Files:**
- Modify: `lib/theme.ts`
- Modify: `src/components/DayTabs.tsx`
- Test: `tests/theme.test.ts`

- [x] **Step 1: Add failing palette assertions**
  - Assert light background is `#F8F6F0`, light text is `#1F1F1F`, primary is warm brown `#9A6A45`, and no theme token contains indigo/blue gradient colors.
- [x] **Step 2: Run `npm test -- tests/theme.test.ts` and observe the expected failure**
- [x] **Step 3: Replace light/dark theme values with the editorial palette while preserving the existing `AppTheme` shape**
- [x] **Step 4: Update DayTabs active/inactive colors and enforce a 44px touch target**
- [x] **Step 5: Run the focused theme tests**

### Task 2: Restyle global entry screens and shared surfaces

**Files:**
- Modify: `src/app/index.tsx`
- Modify: `src/app/login.tsx`
- Modify: `src/components/AuthGate.tsx`
- Modify: `src/components/SkeletonCard.tsx`
- Modify: `src/components/OfflineSyncBanner.tsx`
- Modify: `src/app/+html.tsx`
- Modify: `app.json`
- Test: `tests/editorial-style.test.ts`

- [x] **Step 1: Add failing source-contract checks for warm background, border cards, and absence of heavy shadow/gradient declarations**
- [x] **Step 2: Run the focused contract test and verify it fails against the current blue/shadow styles**
- [x] **Step 3: Restyle home/login/auth/loading/offline surfaces using warm tokens, 1px borders, flat buttons, and 44px controls**
- [x] **Step 4: Change HTML/PWA theme and splash background metadata to the warm palette**
- [x] **Step 5: Run the focused contract test and existing responsive tests**

### Task 3: Restyle trip detail modules and feature panels

**Files:**
- Modify: `src/app/trips/[id].tsx`
- Modify: `src/components/trip-detail/TripDetailHeader.tsx`
- Modify: `src/components/trip-detail/TripDetailTabs.tsx`
- Modify: `src/components/trip-detail/TimelinePanel.tsx`
- Modify: `src/components/trip-detail/ExpensesPanel.tsx`
- Modify: `src/components/ExpenseList.tsx`
- Modify: `src/components/SettlementCard.tsx`
- Modify: `src/components/PackingPanel.tsx`
- Modify: `src/components/VouchersPanel.tsx`
- Modify: `src/components/TripMap.web.tsx`
- Modify: `src/components/TripMap.native.tsx`

- [x] **Step 1: Replace bright blue/indigo controls with `theme.colors.primary`, muted badges, and editorial borders**
- [x] **Step 2: Remove card shadow/elevation declarations except platform map marker compatibility where required**
- [x] **Step 3: Preserve tab horizontal scrolling, responsive widths, dark-mode contrast, and minimum 44px controls**
- [x] **Step 4: Run module/responsive tests and type-check**

### Task 4: Restyle remaining modals and Web-only effects

**Files:**
- Modify: `src/components/CreateTripModal.tsx`
- Modify: `src/components/DocumentUploadModal.tsx`
- Modify: `src/components/DocumentPreviewModal.tsx`
- Modify: `src/components/ExpenseModal.tsx`
- Modify: `src/components/InviteTripModal.tsx`
- Modify: `src/components/TripSettingsModal.tsx`
- Modify: `src/components/VoucherUploadModal.tsx`
- Modify: `src/components/VoucherPreviewModal.tsx`
- Modify: `src/components/animated-icon.module.css`
- Modify: `src/components/animated-icon.tsx`
- Modify: `src/components/animated-icon.web.tsx`
- Modify: `src/components/themed-text.tsx`

- [x] **Step 1: Replace modal blue actions, glassy backdrops, and bright chips with flat warm controls and fine borders**
- [x] **Step 2: Remove animated-icon blue gradient/glow treatment while keeping the mascot/logo animation functional**
- [x] **Step 3: Run source-contract, modal, and map tests**

### Task 5: Full verification

**Files:**
- Verify all changed files and docs

- [x] **Step 1: Run `npm test` and confirm all tests pass**
- [x] **Step 2: Run `npm run type-check`**
- [x] **Step 3: Run `npm run build`**
- [x] **Step 4: Run `git diff --check` and review remaining `gradient`, `shadow`, `indigo`, and `#2563eb` matches**
