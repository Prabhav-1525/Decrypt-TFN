-- Supabase schema for Decrypt-TFN platform

-- Table to store the full application state as JSON (backward compatible with previous kv store)
create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Optional: disable RLS since service role is used server-side
alter table public.app_state disable row level security;

-- Seed the state row can be done by the application on first run; no static seed inserted here.
