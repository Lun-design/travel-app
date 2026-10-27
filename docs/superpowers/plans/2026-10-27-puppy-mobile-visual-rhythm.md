# Puppy Mobile Visual Rhythm Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task. Preserve user-provided work and do not commit automatically.

**Goal:** Make the mobile itinerary feel unmistakably like the user's puppy travel journal while reducing repeated visual noise.

**Architecture:** Reuse the existing `PuppyMascot` registry and user-supplied GIFs. Show a larger decorative dog in the selected day tab and varied smaller decorations in route transitions, while keeping itinerary card content and navigation behavior untouched. Remove the same tiny dog from every Google Maps button.

**Tech Stack:** Expo SDK 55, React Native/Web, TypeScript.

---

## File map

- `lib/puppy.ts`: extend display-only mascot identifiers; do not alter avatar IDs or the existing category mapping.
- `src/components/PuppyMascot.tsx`: static `require` bindings for the small curated GIF set.
- `src/assets/images/puppy/`: copied user-provided source files, preserving bytes.
- `src/components/DayTabs.tsx`: show the decorative character with the selected Day/date tab; retain all labels and handlers.
- `src/components/ItineraryTimeline.shared.tsx`: remove `NavigationPuppy` from repeated navigation buttons; add a decorative mascot to alternating route transition pills and soften their weight.
- `src/components/ItineraryTimeline.web.tsx` and `src/components/ItineraryTimeline.native.tsx`: pass a deterministic decoration choice based on visible item order, without changing route data.
- `tests/puppy-journal.test.ts` and mobile layout assertions: only update stale source expectations if they specifically assert the removed navigation mascot; do not add or run tests in this task.
- `docs/audits/2026-10-20-ux-improvement-backlog.md`: record final implementation/verification evidence and the still-pending real-device visual check.

## Task 1 — Add a small, curated display-only art set

Copy only the approved lightweight animations from `C:\Users\張晉綸\Desktop\debug` into `src/assets/images/puppy/`, using semantic names. Planned: `一起摇.gif` (daily tab), `安慰小鸡毛.gif` and `贴贴咯.gif` (alternating route transition accents). Preserve original frames; exclude all non-selected source images.

Add the three names to `PuppyArtId` and `PuppyMascot`'s static source map. Keep `PUPPY_IDS` unchanged so decorations never become profile-avatar options.

## Task 2 — Make the selected day feel like a chapter

Update `DayTabs` with an optional small transparent decorative mascot for compact mobile tabs. Derive the selected tab's art from its day number deterministically; inactive tabs keep the current date labels and all tab callbacks/accessibility text. Give the selected tab enough height for the mascot without growing the overall row beyond approximately 64px.

## Task 3 — Give the timeline a little more puppy personality

Add an optional decorative art identifier to the timeline card/route presentation flow. In the web and native list renderers, choose a mascot from the curated set deterministically for alternating route transitions only. Render it as a 30–34px non-interactive transparent decoration at the leading edge of the route pill. Leave normal cards, photos, titles, routes, distances, mode selection and navigation URLs intact.

Remove `NavigationPuppy` from the Google Maps button while retaining the compass glyph, label, 44px target and existing press handler. Reduce route-pill contrast/padding slightly so the character and distance remain secondary to stop titles.

## Task 4 — Validate and record

Run TypeScript check and production Web build (do not run test commands unless the user asks). Inspect `git diff --check` and `git status --short`. Confirm the selected tab and route decorations use only explicit local static assets and have `pointerEvents="none"`/accessibility hidden. Update the UX tracker with what changed and the honest limitation: no actual mobile/browser screenshot is available in this session.

Do not change routes, trip data, database schema, user photos, categories or navigation behavior. Do not stage, commit, push or deploy.

## Execution record — 2026-10-27

- Added three original transparent GIFs selected by the user: `journal-dance`, `journal-comfort`, and `journal-hearts`.
- The selected compact day tab now displays a deterministic 38px puppy; alternating route transitions display a 34px varied decoration. Repeated Google Maps buttons no longer include the same puppy.
- Updated existing static-source assertions to describe the new presentation contract; did not add or execute tests.
- `npm.cmd run type-check`, `npm.cmd run build`, `npm.cmd run verify:build`, and `git diff --check` passed. A real mobile/browser screen is not available in this session, so visual confirmation remains pending.
- No database, trip data, navigation URL, or Git metadata changed. No commit, push, or deployment.
