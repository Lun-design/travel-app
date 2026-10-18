# Expense member shares implementation plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. Follow test-driven-development for each behavior.

**Goal:** Show each expense participant's avatar, name and stored share directly on its card.

**Architecture:** Extend `src/components/ExpenseList.tsx` with a wrapping, read-only member breakdown beneath the expense header. Use `expense.splits` in the expense's original currency and reuse `ProfileAvatar` and existing member-name fallback. Do not calculate transfers, redivide totals or change settlement APIs.

**Tech Stack:** Expo 55, React Native Web, TypeScript, Vitest.

## Approved design

- Section heading: `此筆分攤` (not remaining debt).
- Each row: 24px avatar, full wrapping member name, original-currency amount with two decimals, and `墊付者` when the participant is the payer.
- Preserve settled-expense shares and all existing edit/settle/delete actions.
- Support unequal and zero shares; never invent shares for missing data.
- Missing member profiles use existing `ProfileAvatar` and member ID fallback. Missing/invalid amounts display `金額待確認`, never NaN or an invented zero.
- Missing shares display `尚未設定分攤明細`.
- No database migration, API writes, new package or accounting changes.

## Task 1: Regression tests

- [x] Create `tests/expense-member-shares.test.ts` rendering the actual ExpenseList with native surface stubs.
- [x] Assert equal shares have matched avatars/names/amounts and payer labels.
- [x] Assert unequal, zero and settled shares retain their saved amounts and original currency.
- [x] Assert missing profiles and share data remain readable, and edit/delete still call their original handlers.
- [x] Run `npm.cmd test -- --run tests/expense-member-shares.test.ts`; confirmed five failures from missing share UI (existing actions already passed).

## Task 2: Minimal card change

- [x] Modify only `src/components/ExpenseList.tsx` production UI.
- [x] Render saved shares as wrapping rows with stable participant keys; use existing member profile/name helpers.
- [x] Add scoped styles for row spacing, small avatars, wrapping names and non-clipped amounts.
- [x] Run the targeted tests; all six pass.

## Task 3: Verification

- [x] Run `npm.cmd test -- --run` and `npm.cmd run type-check`: 834 tests pass; TypeScript passes.
- [x] Run `npm.cmd run build` and `npm.cmd run verify:build`: both pass.
- [x] Inspect diff: no accounting, persistence or settlement changes. Commit/deploy left to the user.
