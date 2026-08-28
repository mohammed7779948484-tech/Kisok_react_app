-- KIOSK Database V2 Lean · 12 Realtime.
-- Only Preparation needs live operational updates. Customer catalog is a
-- snapshot and is refreshed by the app; no catalog touch triggers/publication.

alter publication supabase_realtime add table public.orders;
