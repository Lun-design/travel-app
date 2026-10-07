# User-Centric UI & Interactive Audit Plan

**Goal:** Audit all screen/modal/card click entry points, document their behavior, and fix confirmed dead-button, duplicate-submit, validation, stale-request, and offline-feedback defects with regression tests.

**Architecture:** Inventory React Native `Pressable`/`TouchableOpacity` and web `<button>` entries by source file and interaction category. Use focused static-contract or pure-helper tests where the repository lacks component-render testing, plus unit tests for async/offline behavior. Only modify confirmed defects, preserving the current component architecture.

**Tech Stack:** Expo SDK 55, React Native / React Native Web, TypeScript, Vitest.

---

### Task 1: Inventory interactive entry points and classify behavior

**Files:** `src/app/**/*.tsx`, `src/components/**/*.tsx`, `tests/**/*.test.ts`

- [ ] Enumerate `onPress`, `onClick`, `<button>`, and accessibility button controls by screen/component.
- [ ] Trace each API-backed action to its handler; note disabled/loading/validation/offline feedback.
- [ ] Record confirmed issues only; treat missing feedback or missing handler as defects only when behavior can be reproduced or traced.

### Task 2: Reproduce and fix confirmed defects using TDD

**Files:** Focused component/helper files and corresponding `tests/*.test.ts`.

- [ ] Add one failing regression test per confirmed defect.
- [ ] Run each focused test and verify the expected Red failure.
- [ ] Apply the smallest fix and rerun focused tests to Green.
- [ ] Re-scan changed entry points for disabled guards, validation, error feedback, and offline behavior.

### Task 3: Verify project-wide behavior

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run type-check`.
- [ ] Publish an inventory grouped by app screens, itinerary, expenses, packing, vouchers/documents, inspiration, and shared modal/navigation controls, with findings and severity.
