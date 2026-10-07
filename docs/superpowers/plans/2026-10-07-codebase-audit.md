# Comprehensive Codebase Audit Plan

> **For agentic workers:** Follow a test-first workflow for every confirmed defect. Keep fixes narrowly scoped and verify each red-green cycle before moving on.

**Goal:** Audit lifecycle, async state races, validation/null-safety, offline replay, rendering, and core edge cases; repair only confirmed defects with regression tests.

**Architecture:** Use static searches to identify suspicious paths, trace each candidate to its data/state boundary, then reproduce defects with focused tests before minimal fixes. Keep offline queue semantics and screen behavior unchanged unless a test proves a bug.

**Tech Stack:** Expo Router, React Native/Web, TypeScript, Supabase, Vitest.

---

### Task 1: Audit async lifecycle and subscriptions

**Files:** `src/**`, `lib/**`, corresponding `tests/**`

- [ ] Inventory effects, timers, listeners, subscriptions, and detached promises.
- [ ] For every confirmed cleanup or unhandled rejection defect, add a failing regression test, verify Red, patch, verify Green.

### Task 2: Audit race conditions and dependency correctness

**Files:** data-loading hooks and panels; relevant component tests

- [ ] Trace search/day/trip request state ownership and stale response handling.
- [ ] Add tests before changing confirmed last-write-wins or stale-closure defects.

### Task 3: Audit validation, persistence, and offline replay

**Files:** `lib/offline-*`, Supabase mutation helpers, import/reorder/move APIs

- [ ] Verify replay idempotency and rollback behavior under repeated replay/network transitions.
- [ ] Add deterministic tests for any confirmed duplicate/order corruption defect before repair.

### Task 4: Audit core edge cases and rendering performance

**Files:** pure date/schedule/expense helpers, long-list renderers, UI tests

- [ ] Add edge tests for timezone/leap dates, zero/negative amounts, empty data, and long names.
- [ ] Check list keys and virtualization choices; only alter rendering if a measurable correctness/performance defect is demonstrated.

### Task 5: Full verification and findings report

- [ ] Run `npm test -- --run`, `npm run type-check`, and `git diff --check`.
- [ ] Report verified findings by severity and note any checks blocked by environment/tooling.
