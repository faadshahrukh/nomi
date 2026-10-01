-- Greeting name, collected during onboarding.
alter table public.profiles add column display_name text check (display_name is null or length(display_name) between 1 and 60);
