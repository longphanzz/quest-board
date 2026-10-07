-- Stream profile changes over Realtime so open devices learn about a new board revision immediately.
-- RLS still applies: each signed-in user only receives events for their own row.
alter publication supabase_realtime add table public.profiles;
