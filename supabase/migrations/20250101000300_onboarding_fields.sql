-- Onboarding: what the user wants from the app, and when setup was completed.
alter table public.profiles add column primary_goals text[] not null default '{}';
alter table public.profiles add column onboarded_at timestamptz;
