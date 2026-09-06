# Stage 4 Performance and Product Design

## Scope

Stage 4 has three independent but compatible improvements: remove the home-screen member N+1 request pattern, give the trip detail screen smaller maintenance boundaries, and export trip items as an iCalendar file.

## Architecture

### Home aggregation

`lib/trips.ts` will expose `listTripsWithMembers`. It calls a typed Supabase RPC named `list_trips_with_members` that returns one row per trip with a JSON member summary. A migration defines the `security invoker` function and grants execution to authenticated users; the function filters rows through the existing trip-member policy. If RPC is unavailable or returns a schema/function error, the service falls back to the existing `listTrips` query and a bounded member query so older environments continue to work. The aggregated result is cached in the existing user/trip offline snapshots.

The home screen consumes the aggregated result and no longer runs one member request per card. The existing `members` map shape is retained to avoid changing card rendering.

### Trip detail boundaries

`useTripDetailData` owns trip/member/itinerary/expense/voucher loading, offline scope, and reconnect refresh. `TripDetailHeader`, `TripDetailTabs`, `TimelinePanel`, and `ExpensesPanel` remain presentational and receive the same data/callbacks the current screen already has. The route component keeps tab state and modal orchestration. This split is incremental: no behavior or URL changes, and the existing Packing/Vouchers panels remain their own modules.

### Calendar export

`lib/calendar.ts` provides pure `escapeIcsText`, `formatIcsDateTime`, `buildTripIcs`, and a browser/native adapter `exportTripCalendar`. Dates use the trip's IANA timezone and the existing schedule calculation; missing item times fall back to the daily departure time and duration. Each event includes `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `LOCATION`, and `VALARM` with a 15-minute trigger. Web creates a Blob download; native returns the serialized text for a future share adapter.

## Error handling and compatibility

- RPC failures that indicate an unavailable function fall back to the existing query path; permission/network errors still use the existing offline snapshot fallback.
- Invalid or missing coordinates do not affect calendar export; events can still be generated from title/address/time.
- ICS escaping handles backslashes, commas, semicolons, and line breaks, with CRLF line endings.
- No private trip data is added to Service Worker Cache Storage.

## Testing

- RPC mapping and fallback are tested with mocked Supabase responses.
- Calendar tests cover escaping, timezone conversion, overnight/duration end times, reminders, and missing times.
- A route contract test verifies the hook and modular panels are wired without requiring React Native rendering.
