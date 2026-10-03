-- Sinkronizimi i familjes për Buxhetin.
-- Model: pa Supabase Auth. Çdo pajisje merr një token sekret kur krijon/bashkohet me një familje.
-- Tabelat janë të mbyllura me RLS (pa politika) — qasja vetëm përmes funksioneve më poshtë,
-- të cilat verifikojnë tokenin (ruhet vetëm si hash SHA-256).

create extension if not exists pgcrypto with schema extensions;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  token_hash text not null unique,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index household_members_household_idx on public.household_members (household_id);

create table public.records (
  household_id uuid not null references public.households (id) on delete cascade,
  type text not null check (type in ('budget', 'category', 'person', 'expense', 'split', 'transfer', 'adjustment', 'recurring', 'carry')),
  id text not null check (char_length(id) between 1 and 120),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.household_members (id) on delete set null,
  primary key (household_id, type, id),
  check (deleted or data is not null),
  check (data is null or pg_column_size(data) < 16384)
);
create index records_pull_idx on public.records (household_id, updated_at, type, id);
create index records_updated_by_idx on public.records (updated_by);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.records enable row level security;
revoke all on public.households, public.household_members, public.records from anon, authenticated;

-- ───────── ndihmës të brendshëm ─────────

create function public._hash(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

-- Kod ftese 10 shkronja, pa karaktere që ngatërrohen (0/O, 1/I/L).
create function public._new_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(10);
  code text := '';
begin
  for i in 0..9 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end $$;

create function public._member(p_token text) returns public.household_members
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  update public.household_members set last_seen_at = now()
   where token_hash = public._hash(p_token)
  returning * into m;
  if m.id is null then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  return m;
end $$;

-- ───────── familja ─────────

create function public.create_household(p_name text, p_display_name text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  h public.households;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  mid uuid;
begin
  insert into public.households (name, join_code) values (trim(p_name), public._new_join_code()) returning * into h;
  insert into public.household_members (household_id, display_name, token_hash, role)
    values (h.id, trim(p_display_name), public._hash(token), 'owner') returning id into mid;
  return json_build_object('household_id', h.id, 'household_name', h.name, 'join_code', h.join_code, 'member_id', mid, 'member_token', token);
end $$;

create function public.join_household(p_code text, p_display_name text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  h public.households;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  mid uuid;
begin
  select * into h from public.households
   where join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if h.id is null then
    raise exception 'invalid_code' using errcode = '28000';
  end if;
  insert into public.household_members (household_id, display_name, token_hash)
    values (h.id, trim(p_display_name), public._hash(token)) returning id into mid;
  return json_build_object('household_id', h.id, 'household_name', h.name, 'join_code', h.join_code, 'member_id', mid, 'member_token', token);
end $$;

create function public.household_info(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members := public._member(p_token);
begin
  return (
    select json_build_object(
      'household_id', h.id, 'household_name', h.name, 'join_code', h.join_code, 'member_id', m.id, 'role', m.role,
      'members', (select coalesce(json_agg(json_build_object('id', x.id, 'display_name', x.display_name, 'role', x.role, 'joined_at', x.joined_at, 'last_seen_at', x.last_seen_at) order by x.joined_at), '[]'::json)
                    from public.household_members x where x.household_id = h.id))
    from public.households h where h.id = m.household_id);
end $$;

create function public.rotate_join_code(p_token text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members := public._member(p_token); code text;
begin
  if m.role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.households set join_code = public._new_join_code() where id = m.household_id returning join_code into code;
  return code;
end $$;

-- Pronari heq një anëtar; çdo anëtar mund të largohet vetë (p_member_id = id i vet).
create function public.remove_member(p_token text, p_member_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members := public._member(p_token);
begin
  if p_member_id <> m.id and m.role <> 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.household_members where id = p_member_id and household_id = m.household_id;
end $$;

-- ───────── sinkronizimi ─────────

-- Ngarkon ndryshimet: [{type, id, data, deleted}]. Kthen orën e serverit.
create function public.sync_push(p_token text, p_records jsonb) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members := public._member(p_token); r jsonb;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 500 then
    raise exception 'bad_batch' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_records) loop
    insert into public.records as t (household_id, type, id, data, deleted, updated_at, updated_by)
    values (m.household_id, r->>'type', r->>'id',
            case when coalesce((r->>'deleted')::boolean, false) then null else r->'data' end,
            coalesce((r->>'deleted')::boolean, false), clock_timestamp(), m.id)
    on conflict (household_id, type, id) do update
      set data = excluded.data, deleted = excluded.deleted, updated_at = clock_timestamp(), updated_by = m.id;
  end loop;
  return clock_timestamp();
end $$;

-- Shkarkon ndryshimet pas kursorit (updated_at, type, id), me faqe.
create function public.sync_pull(p_token text, p_since timestamptz, p_after_type text default '', p_after_id text default '', p_limit int default 500)
returns table (type text, id text, data jsonb, deleted boolean, updated_at timestamptz, updated_by uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare m public.household_members := public._member(p_token);
begin
  return query
    select r.type, r.id, r.data, r.deleted, r.updated_at, r.updated_by
      from public.records r
     where r.household_id = m.household_id
       and (r.updated_at, r.type, r.id) > (coalesce(p_since, '-infinity'::timestamptz), coalesce(p_after_type, ''), coalesce(p_after_id, ''))
     order by r.updated_at, r.type, r.id
     limit least(greatest(p_limit, 1), 1000);
end $$;

-- Vetëm funksionet publike janë të thirrshme nga aplikacioni.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_household(text, text),
  public.join_household(text, text),
  public.household_info(text),
  public.rotate_join_code(text),
  public.remove_member(text, uuid),
  public.sync_push(text, jsonb),
  public.sync_pull(text, timestamptz, text, text, int)
to anon;
