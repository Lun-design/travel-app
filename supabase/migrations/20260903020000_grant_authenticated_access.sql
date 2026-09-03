-- 基本 schema 使用權限（RLS 仍會繼續限制資料列）
grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;

-- PostgREST 查詢需要 table privilege，實際資料列權限仍由 RLS policy 控制
grant all on table public.trips to authenticated;
grant all on table public.trip_members to authenticated;
grant all on table public.itinerary_items to authenticated;
grant all on table public.expenses to authenticated;

-- RPC 與 helper functions
grant execute on function public.join_trip_by_invite_code(text) to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;
grant execute on function private.can_edit_trip(uuid) to authenticated;
grant execute on function private.is_trip_owner(uuid) to authenticated;
