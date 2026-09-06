# Third-Stage Offline Sync Design

## Goal

Allow the web/PWA client to keep trip data usable without a network connection and synchronize local edits back to Supabase when connectivity returns.

## Storage boundary

`lib/offline-store.ts` owns persistence. Browser builds use one IndexedDB database (`travel-planner-offline-v1`) with a `snapshots` object store and a `mutations` object store. Every key contains both `userId` and `tripId`, so one signed-in user cannot read another user's cached trip. A memory adapter is injected in tests and used as a safe fallback where IndexedDB is unavailable.

Snapshots contain the trip, members, itinerary items, expenses, packing items, and vouchers needed by the detail screen. They are written only after a successful Supabase read or an optimistic local mutation.

## Mutation queue

`lib/offline-sync.ts` stores mutations with an id, scope, entity, operation, payload, client timestamp, and optional conflict metadata. Network failures are the only errors that enter the queue; validation, authorization, and schema errors still surface immediately. Mutations for the same resource are coalesced by the newest client timestamp before a sync pass.

The sync service accepts an injected executor so its ordering and conflict behavior are unit-testable without Supabase. A real executor delegates to the existing itinerary, packing, and expense APIs. Successful mutations are removed. A server rejection is retained as a conflict with the local payload and server error so the UI can offer either `keep-local` (retry) or `use-remote` (discard local mutation and reload).

## UI integration

The trip detail page and packing panel persist successful reads and use the scoped snapshot on network failure. Existing API signatures remain compatible; optional offline context is passed only where a caller has user/trip scope. The detail page listens for `online`/`offline`, runs a background sync on reconnect, and displays pending/conflict state. Conflict actions are explicit and small: keep local retries the mutation, while use remote removes it and reloads Supabase data.

Service-worker caches remain limited to public/static assets. Private Supabase responses and signed documents are not added to Cache Storage. Logout clears IndexedDB snapshots, queued mutations, conflicts, and runtime asset caches while preserving theme preferences.

## Verification

Tests cover scope isolation, IndexedDB fallback behavior through the memory adapter, queue persistence and newest-first coalescing, network-only enqueue rules, conflict resolution, and automatic online sync. The existing complete Vitest suite, TypeScript check, and Expo web export remain required gates.
