# Settlement safety implementation plan

**Goal:** Implement approved UX-01 confirmations without changing accounting or schema.

**Architecture:** A small shared confirmation modal presents read-only content and fixed actions. ExpenseList previews existing outstanding-transfer calculations; settleExpense optionally rejects changed previews before any write. SettlementCard confirms history deletion and guards existing settlement submissions. Synchronous refs prevent duplicate events and scoped request IDs prevent late UI responses.

**Tech Stack:** Expo 55, React Native/Web, TypeScript, Vitest.

## Tasks

- [x] Add failing UI tests in `tests/settlement-safety-ui.test.ts` for no-write initial clicks/cancel, partial amounts, avatars, double submits, failures and stale responses.
- [x] Add a failing API test in `tests/settlement-api.test.ts` for changed preview rejection before writes.
- [x] Implement `src/components/ActionConfirmationModal.tsx` with scrollable content, overlay cancellation, fixed actions and busy/error feedback.
- [x] Update `ExpenseList.tsx` to confirm deletion and preview/confirm settlement using saved splits and existing clearance records.
- [x] Add an optional expected-transfer guard to `lib/settlement-api.ts`; preserve original default behavior for existing callers. Guarded calls re-read current DB expense as well as history.
- [x] Update `SettlementCard.tsx` to confirm history deletion and prevent duplicate or stale general-settlement submissions.
- [x] Update prior direct-delete test to the approved confirmation behavior; retain existing accounting tests.
- [x] Run targeted tests (Red then Green), `npm test -- --run`, `npm run type-check`, `npm run build`, `npm run verify:build`: 852 tests / 126 files pass; all commands exit 0.
- [x] Update UX-01 tracking with actual local verification; not deployed or user-accepted.

## Verification cases

Cancel all three new confirmation paths: zero mutation calls. Expense 36,666 with shares 18,333 and an existing transfer of 500: preview 17,833. Confirm repeatedly: one write invocation. New history before confirmation: changed preview error, no write. Load failure: no enabled settlement submit, retry remains possible. Account/trip change or closing preview: late responses ignored. Confirmed deletion calls the original parent callback. Settlement history deletion warns that no real transfer is reversed.

The check before writes is not an atomic multi-user database transaction; any transaction-level concurrency limitation remains explicitly documented, not hidden behind the new UI.
