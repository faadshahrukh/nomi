-- Nomi server schema. Mirrors the on-device SQLite schema (packages/core/src/sql/migrations.ts) and adds
-- what only a server needs: ownership by auth.users, row-level security, integrity triggers, AI quota, export and account deletion.
--
-- Rules this file enforces:
--   * Every user table is protected by row-level security: a signed-in user can only ever see and change their own rows.
--   * References between a user's own rows use composite keys (user_id, id), so a row can never point at another user's row.
--   * Money is bigint minor units. Dates are calendar dates in the user's timezone (local_date), never UTC instants.
--   * The audit log is append-only. Transactions are soft-deleted and carry a version for conflict detection.

------------------------------------------------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

------------------------------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  country text not null default 'BD',
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Dhaka',
  locale text not null default 'mixed' check (locale in ('en', 'bn', 'mixed')),
  confirmation_pref text not null default 'always_confirm' check (confirmation_pref in ('always_confirm', 'auto_save_high_confidence')),
  high_impact_minor bigint not null default 1000000 check (high_impact_minor >= 0),
  safety_buffer_minor bigint not null default 0 check (safety_buffer_minor >= 0),
  retain_raw_input boolean not null default false,
  ai_processing boolean not null default true,
  default_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  name text not null check (length(name) between 1 and 80),
  type text not null check (type in ('cash', 'bank', 'card', 'mobile_wallet', 'savings', 'business', 'custom')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  aliases text[] not null default '{}',
  opening_balance_minor bigint not null default 0,
  include_in_liquid boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.profiles
  add constraint profiles_default_account_fk foreign key (user_id, default_account_id) references public.accounts (user_id, id) deferrable initially deferred;

-- System categories have user_id null and are shared and read-only. A user's own categories carry their user_id.
create table public.categories (
  id text primary key check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  user_id uuid references auth.users (id) on delete cascade,
  parent_id text references public.categories (id),
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('expense', 'income')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_user_idx on public.categories (user_id);

create table public.people (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  name text not null check (length(name) between 1 and 80),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  target_minor bigint not null check (target_minor > 0),
  target_date date,
  monthly_contribution_minor bigint check (monthly_contribution_minor is null or monthly_contribution_minor >= 0),
  opening_saved_minor bigint not null default 0 check (opening_saved_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.recurring_rules (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  name text not null check (length(name) between 1 and 80),
  type text not null check (type in ('expense', 'income')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  account_id text not null,
  category_id text references public.categories (id),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval_n integer not null default 1 check (interval_n >= 1),
  anchor_date date not null,
  end_date date,
  is_bill boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.accounts (user_id, id)
);

create table public.budgets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  category_id text references public.categories (id), -- null = overall monthly budget
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.transactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9._-]{1,64}$'),
  type text not null check (type in ('expense', 'income', 'transfer', 'refund', 'debt', 'repayment', 'savings_contribution', 'goal_contribution')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  category_id text references public.categories (id),
  merchant_name text,
  account_id text,
  to_account_id text,
  local_date date not null,
  local_time time,
  notes text,
  paid_by text not null default 'me',
  splits jsonb,
  counterparty_id text,
  debt_direction text check (debt_direction in ('lent', 'borrowed')),
  repayment_direction text check (repayment_direction in ('received', 'paid')),
  goal_id text,
  recurring_rule_id text,
  occurrence_date date,
  source text not null check (source in ('manual', 'text', 'voice', 'receipt', 'import', 'sync')),
  ai_confidence real check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  raw_input text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1 check (version >= 1),
  primary key (user_id, id),
  -- every reference stays inside the same user
  foreign key (user_id, account_id) references public.accounts (user_id, id),
  foreign key (user_id, to_account_id) references public.accounts (user_id, id),
  foreign key (user_id, counterparty_id) references public.people (user_id, id),
  foreign key (user_id, goal_id) references public.goals (user_id, id),
  foreign key (user_id, recurring_rule_id) references public.recurring_rules (user_id, id),
  -- shape rules, identical in meaning to packages/core validateTransaction
  constraint tx_internal_move_has_destination check ((type in ('transfer', 'savings_contribution', 'goal_contribution')) = (to_account_id is not null)),
  constraint tx_move_accounts_differ check (to_account_id is null or account_id is distinct from to_account_id),
  constraint tx_account_required check (account_id is not null or (type = 'expense' and paid_by <> 'me')),
  constraint tx_debt_needs_party check (type <> 'debt' or (counterparty_id is not null and debt_direction is not null)),
  constraint tx_repayment_needs_party check (type <> 'repayment' or (counterparty_id is not null and repayment_direction is not null)),
  constraint tx_goal_required check (type <> 'goal_contribution' or goal_id is not null),
  constraint tx_only_expenses_split check (splits is null or type = 'expense'),
  constraint tx_paid_by_other_needs_split check (paid_by = 'me' or (type = 'expense' and splits is not null)),
  constraint tx_occurrence_pair check ((recurring_rule_id is null) = (occurrence_date is null))
);
create index tx_user_date_idx on public.transactions (user_id, local_date);
create index tx_user_category_idx on public.transactions (user_id, category_id, local_date);
create index tx_user_account_idx on public.transactions (user_id, account_id);
create unique index tx_recurring_occurrence_uq on public.transactions (user_id, recurring_rule_id, occurrence_date)
  where recurring_rule_id is not null and deleted_at is null;

create table public.audit_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  entity text not null check (entity in ('transaction')),
  entity_id text not null,
  action text not null check (action in ('create', 'update', 'delete')),
  at timestamptz not null,
  changed_fields text[] not null default '{}',
  before jsonb,
  after jsonb,
  primary key (user_id, id)
);
create index audit_entity_idx on public.audit_log (user_id, entity_id);

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

------------------------------------------------------------------------------------------------------------------------
-- Integrity triggers
------------------------------------------------------------------------------------------------------------------------
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger accounts_touch before update on public.accounts for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
create trigger people_touch before update on public.people for each row execute function public.touch_updated_at();
create trigger goals_touch before update on public.goals for each row execute function public.touch_updated_at();
create trigger rules_touch before update on public.recurring_rules for each row execute function public.touch_updated_at();
create trigger budgets_touch before update on public.budgets for each row execute function public.touch_updated_at();

-- A row may only reference a system category or one of the same user's own categories (a foreign key alone would let it
-- point at someone else's category, since foreign-key checks bypass row-level security).
create function public.assert_category_visible() returns trigger language plpgsql as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and (c.user_id is null or c.user_id = new.user_id)
  ) then
    raise exception 'category % is not available to this user', new.category_id using errcode = '23503';
  end if;
  return new;
end $$;
create trigger tx_category_visible before insert or update of category_id on public.transactions for each row execute function public.assert_category_visible();
create trigger budgets_category_visible before insert or update of category_id on public.budgets for each row execute function public.assert_category_visible();
create trigger rules_category_visible before insert or update of category_id on public.recurring_rules for each row execute function public.assert_category_visible();

-- Splits: the user's own cost and each friend's share must add up to the total, and every named person must be one of the user's.
create function public.validate_transaction_row() returns trigger language plpgsql as $$
declare total bigint; party record;
begin
  if new.paid_by <> 'me' and not exists (select 1 from public.people p where p.user_id = new.user_id and p.id = new.paid_by) then
    raise exception 'paid_by is not one of this user''s people' using errcode = '23503';
  end if;
  if new.splits is not null then
    if jsonb_typeof(new.splits) <> 'array' or jsonb_array_length(new.splits) = 0 then
      raise exception 'splits must be a non-empty array' using errcode = '23514';
    end if;
    total := 0;
    for party in select e->>'personId' as person_id, e->'amountMinor' as amount from jsonb_array_elements(new.splits) e loop
      if party.person_id is null or party.amount is null or jsonb_typeof(party.amount) <> 'number' or (party.amount)::text !~ '^[0-9]+$' then
        raise exception 'each split needs a personId and a whole, non-negative amountMinor' using errcode = '23514';
      end if;
      if party.person_id <> 'me' and not exists (select 1 from public.people p where p.user_id = new.user_id and p.id = party.person_id) then
        raise exception 'split person is not one of this user''s people' using errcode = '23503';
      end if;
      total := total + (party.amount)::text::bigint;
    end loop;
    if total <> new.amount_minor then
      raise exception 'split amounts (%) must add up to the total (%)', total, new.amount_minor using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger tx_validate before insert or update on public.transactions for each row execute function public.validate_transaction_row();

-- Optimistic concurrency: every update must carry version = old version + 1, so two devices cannot silently overwrite each other.
create function public.enforce_version_bump() returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'version conflict: expected %, got %', old.version + 1, new.version using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger tx_version before update on public.transactions for each row execute function public.enforce_version_bump();

------------------------------------------------------------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.people enable row level security;
alter table public.goals enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_log enable row level security;
alter table public.ai_usage enable row level security;

-- Privileges: nothing for anonymous callers. Signed-in users get table access that RLS then narrows to their own rows.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on public.profiles, public.accounts, public.categories, public.people, public.goals,
  public.recurring_rules, public.budgets, public.transactions to authenticated;
grant select, insert on public.audit_log to authenticated;      -- append-only
grant select on public.ai_usage to authenticated;               -- written only by consume_ai_quota

create policy profiles_own on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_own on public.accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy people_own on public.people for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_own on public.goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rules_own on public.recurring_rules for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_own on public.budgets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_own on public.transactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Categories: everyone signed in can read the system set and their own; only their own can be written. System rows are untouchable.
create policy categories_read on public.categories for select to authenticated using (user_id is null or user_id = auth.uid());
create policy categories_insert on public.categories for insert to authenticated with check (user_id = auth.uid());
create policy categories_update on public.categories for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_delete on public.categories for delete to authenticated using (user_id = auth.uid());

-- Audit log: read and append your own. No update or delete policy exists, so neither is possible.
create policy audit_read on public.audit_log for select to authenticated using (user_id = auth.uid());
create policy audit_append on public.audit_log for insert to authenticated with check (user_id = auth.uid());

create policy usage_read on public.ai_usage for select to authenticated using (user_id = auth.uid());

------------------------------------------------------------------------------------------------------------------------
-- Functions
------------------------------------------------------------------------------------------------------------------------
-- AI allowance. Callable only by the server (service role) from the interpret Edge Function, with the user id it has already
-- verified from the access token. Clients cannot call it, so they cannot reset or inflate their own usage.
create function public.consume_ai_quota(p_user uuid, p_limit integer default 200) returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  if p_user is null or p_limit is null or p_limit < 1 then return false; end if;
  insert into public.ai_usage as u (user_id, day, count)
    values (p_user, (now() at time zone 'utc')::date, 1)
    on conflict (user_id, day) do update set count = u.count + 1 where u.count < p_limit
    returning count into used;
  return used is not null; -- null means the day's allowance was already used up
end $$;
revoke all on function public.consume_ai_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer) to service_role;

-- Export: everything the signed-in user owns, including soft-deleted transactions, as one JSON document. Runs as the caller,
-- so row-level security guarantees it cannot include anyone else's data.
create function public.export_my_data() returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.categories c where c.user_id is not null), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.people p), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from public.goals g), '[]'::jsonb),
    'recurringRules', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.recurring_rules r), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.local_date, t.id) from public.transactions t), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.at, l.id) from public.audit_log l), '[]'::jsonb)
  )
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Account deletion: removes the user and, through ON DELETE CASCADE, every row they own.
create function public.delete_my_account() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
