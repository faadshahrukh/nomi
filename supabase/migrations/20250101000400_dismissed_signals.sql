-- Radar signals the user has dismissed. Keys are scoped to a month or a specific item (for example
-- "budget:<id>:2025-03"), so dismissing one never hides a different problem. No financial values are stored here.
create table public.dismissed_signals (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.dismissed_signals enable row level security;
revoke all on public.dismissed_signals from anon;
grant select, insert, delete on public.dismissed_signals to authenticated;
create policy dismissed_signals_own on public.dismissed_signals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
