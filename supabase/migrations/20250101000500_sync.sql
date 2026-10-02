-- Offline-first sync. The device keeps the full ledger and works without a connection; when it can reach the server it sends the
-- changes it has queued (sync_push) and fetches what other devices changed (sync_pull). Both run as the caller, so row-level security
-- decides what they can touch exactly as it does for ordinary queries.
--
--   * Transactions use optimistic concurrency: a change is applied only if the device's base version still matches the server's.
--     Otherwise the server answers "conflict" with its own copy and the device decides (see packages/core/src/sync/resolve.ts).
--   * Everything else (accounts, people, goals, recurring rules, budgets, profile) is last-write-wins, since those are rarely edited
--     on two devices at once and a stale overwrite is cheap to correct.
--   * Budgets are the one thing the app deletes for real, so they carry a deleted_at tombstone for other devices to learn from.
--   * server_rev is a global, increasing stamp set on every write. Devices pull "everything after the last stamp I saw".

create sequence public.sync_rev_seq;
revoke all on sequence public.sync_rev_seq from public, anon, authenticated;

alter table public.profiles add column server_rev bigint;
alter table public.categories add column server_rev bigint;
alter table public.accounts add column server_rev bigint;
alter table public.people add column server_rev bigint;
alter table public.goals add column server_rev bigint;
alter table public.recurring_rules add column server_rev bigint;
alter table public.budgets add column server_rev bigint, add column deleted_at timestamptz;
alter table public.transactions add column server_rev bigint;

update public.profiles set server_rev = nextval('public.sync_rev_seq');
update public.categories set server_rev = nextval('public.sync_rev_seq');
update public.accounts set server_rev = nextval('public.sync_rev_seq');
update public.people set server_rev = nextval('public.sync_rev_seq');
update public.goals set server_rev = nextval('public.sync_rev_seq');
update public.recurring_rules set server_rev = nextval('public.sync_rev_seq');
update public.budgets set server_rev = nextval('public.sync_rev_seq');
update public.transactions set server_rev = nextval('public.sync_rev_seq');

alter table public.profiles alter column server_rev set not null;
alter table public.categories alter column server_rev set not null;
alter table public.accounts alter column server_rev set not null;
alter table public.people alter column server_rev set not null;
alter table public.goals alter column server_rev set not null;
alter table public.recurring_rules alter column server_rev set not null;
alter table public.budgets alter column server_rev set not null;
alter table public.transactions alter column server_rev set not null;

-- Security definer so signed-in users never need (or get) direct access to the sequence.
create function public.stamp_server_rev() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.server_rev := nextval('public.sync_rev_seq');
  return new;
end $$;
create trigger categories_rev before insert or update on public.categories for each row execute function public.stamp_server_rev();
create trigger profiles_rev before insert or update on public.profiles for each row execute function public.stamp_server_rev();
create trigger accounts_rev before insert or update on public.accounts for each row execute function public.stamp_server_rev();
create trigger people_rev before insert or update on public.people for each row execute function public.stamp_server_rev();
create trigger goals_rev before insert or update on public.goals for each row execute function public.stamp_server_rev();
create trigger rules_rev before insert or update on public.recurring_rules for each row execute function public.stamp_server_rev();
create trigger budgets_rev before insert or update on public.budgets for each row execute function public.stamp_server_rev();
create trigger tx_rev before insert or update on public.transactions for each row execute function public.stamp_server_rev();

-- Which of the incoming fields a device may write. user_id is always the caller; updated_at and server_rev are the server's;
-- the profile's default account is a per-device preference and is never synced (a foreign key to a row that may not have
-- arrived yet would otherwise fail the whole batch at commit).
create function public.sync_columns(p_table text, p_incoming jsonb) returns text[] language sql stable set search_path = public as $$
  select array(select c.column_name::text from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = p_table and p_incoming ? c.column_name::text
                 and c.column_name not in ('user_id', 'updated_at', 'server_rev', 'default_account_id')
               order by c.ordinal_position)
$$;

-- Applies a batch of queued changes. Each item is handled on its own (one bad item never blocks the rest) and reports:
--   ok        applied; `row` is the server's copy (for transactions this carries the new version)
--   conflict  a transaction was changed elsewhere since the device's base version; `row` is the server's copy
--   rejected  the server refused it (constraint or policy); `message` carries only the error class, never the values
create function public.sync_push(p_items jsonb) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  item jsonb; ent text; incoming jsonb; base integer; results jsonb := '[]'::jsonb;
  cols text[]; collist text; setlist text; cur public.transactions; saved jsonb; rid text;
  ignore_keys text[] := array['user_id', 'created_at', 'updated_at', 'server_rev', 'version', 'deleted_at'];
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'too many items' using errcode = '22023'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    ent := item->>'entity';
    incoming := coalesce(item->'row', '{}'::jsonb);
    base := nullif(item->>'base_version', '')::integer;
    rid := coalesce(incoming->>'id', 'profile');
    begin
      if ent not in ('profiles', 'categories', 'accounts', 'people', 'goals', 'recurring_rules', 'budgets', 'transactions') then
        raise exception 'unknown entity' using errcode = '22023';
      end if;
      cols := public.sync_columns(ent, incoming);

      if ent = 'transactions' then
        select * into cur from public.transactions where user_id = uid and id = incoming->>'id';
        if not found then
          incoming := incoming || jsonb_build_object('version', 1);
          collist := (select string_agg(quote_ident(c), ', ') from unnest(cols) c);
          execute format('insert into public.transactions (user_id, %1$s) select $1, %1$s from jsonb_populate_record(null::public.transactions, $2)', collist) using uid, incoming;
        elsif (to_jsonb(cur) - ignore_keys) = (to_jsonb(jsonb_populate_record(null::public.transactions, incoming || jsonb_build_object('user_id', uid, 'version', cur.version))) - ignore_keys)
              and (cur.deleted_at is not null) = ((incoming->>'deleted_at') is not null) then
          null; -- the device is repeating something the server already has (a lost reply): nothing to do
        elsif base is not null and cur.version = base then
          setlist := (select string_agg(format('%1$I = r.%1$I', c), ', ') from unnest(cols) c where c not in ('id', 'created_at', 'version'));
          execute format('update public.transactions t set %s, version = $3 from jsonb_populate_record(null::public.transactions, $2) r where t.user_id = $1 and t.id = r.id', setlist) using uid, incoming, base + 1;
        else
          results := results || jsonb_build_object('entity', ent, 'id', rid, 'status', 'conflict', 'row', to_jsonb(cur));
          continue;
        end if;
        select to_jsonb(t) into saved from public.transactions t where t.user_id = uid and t.id = incoming->>'id';

      elsif ent = 'profiles' then
        collist := (select string_agg(quote_ident(c), ', ') from unnest(cols) c);
        setlist := (select string_agg(format('%1$I = excluded.%1$I', c), ', ') from unnest(cols) c where c <> 'created_at');
        execute format('insert into public.profiles (user_id, %1$s) select $1, %1$s from jsonb_populate_record(null::public.profiles, $2) on conflict (user_id) do update set %2$s', collist, setlist) using uid, incoming;
        select to_jsonb(p) into saved from public.profiles p where p.user_id = uid;

      elsif ent = 'categories' then
        -- A category's id is unique across everyone (system categories share the table), so an id that belongs to someone else is refused, never overwritten.
        collist := (select string_agg(quote_ident(c), ', ') from unnest(cols) c);
        setlist := (select string_agg(format('%1$I = excluded.%1$I', c), ', ') from unnest(cols) c where c not in ('id', 'created_at'));
        execute format('insert into public.categories (user_id, %1$s) select $1, %1$s from jsonb_populate_record(null::public.categories, $2) on conflict (id) do update set %2$s where public.categories.user_id = $1', collist, setlist) using uid, incoming;
        select to_jsonb(c) into saved from public.categories c where c.user_id = uid and c.id = incoming->>'id';
        if saved is null then raise exception 'category id not available' using errcode = '42501'; end if;

      else
        collist := (select string_agg(quote_ident(c), ', ') from unnest(cols) c);
        setlist := (select string_agg(format('%1$I = excluded.%1$I', c), ', ') from unnest(cols) c where c not in ('id', 'created_at'));
        execute format('insert into public.%1$I (user_id, %2$s) select $1, %2$s from jsonb_populate_record(null::public.%1$I, $2) on conflict (user_id, id) do update set %3$s', ent, collist, setlist) using uid, incoming;
        execute format('select to_jsonb(t) from public.%1$I t where t.user_id = $1 and t.id = $2', ent) into saved using uid, incoming->>'id';
      end if;

      results := results || jsonb_build_object('entity', ent, 'id', rid, 'status', 'ok', 'row', saved);
    exception when others then
      results := results || jsonb_build_object('entity', ent, 'id', rid, 'status', 'rejected', 'message', 'sqlstate ' || sqlstate);
    end;
  end loop;
  return results;
end $$;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Everything that changed after the stamp the device last saw, oldest first, in pages.
create function public.sync_pull(p_since bigint default 0, p_limit integer default 500) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_limit, 500), 1), 1000); rows jsonb; cursor bigint; total integer;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  with changed as (
    select 'profiles' as entity, to_jsonb(x) as row, x.server_rev from public.profiles x where x.server_rev > p_since
    union all select 'categories', to_jsonb(x), x.server_rev from public.categories x where x.user_id = auth.uid() and x.server_rev > p_since
    union all select 'accounts', to_jsonb(x), x.server_rev from public.accounts x where x.server_rev > p_since
    union all select 'people', to_jsonb(x), x.server_rev from public.people x where x.server_rev > p_since
    union all select 'goals', to_jsonb(x), x.server_rev from public.goals x where x.server_rev > p_since
    union all select 'recurring_rules', to_jsonb(x), x.server_rev from public.recurring_rules x where x.server_rev > p_since
    union all select 'budgets', to_jsonb(x), x.server_rev from public.budgets x where x.server_rev > p_since
    union all select 'transactions', to_jsonb(x), x.server_rev from public.transactions x where x.server_rev > p_since
  ), page as (select * from changed order by server_rev limit lim)
  select coalesce(jsonb_agg(jsonb_build_object('entity', entity, 'row', row) order by server_rev), '[]'::jsonb), coalesce(max(server_rev), p_since), count(*)
    into rows, cursor, total from page;
  return jsonb_build_object('rows', rows, 'cursor', cursor, 'more', total = lim);
end $$;
revoke all on function public.sync_pull(bigint, integer) from public, anon;
grant execute on function public.sync_pull(bigint, integer) to authenticated;
