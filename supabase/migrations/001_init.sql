-- Fitness Central: schema, row level security, and group functions.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Principle: the browser can only READ its own data. Everything that changes
-- group membership or touches Strava tokens goes through server-side code
-- or SECURITY DEFINER functions that check auth.uid() themselves.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Non-secret link between a user and their Strava account.
create table public.strava_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  athlete_id bigint not null unique,
  scope text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

-- Secret OAuth tokens. RLS on, NO policies, no grants: only the service role
-- (server code) can touch this table. Consider Supabase Vault for encryption at rest.
create table public.strava_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);

create table public.activities (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'strava',
  external_id bigint not null,
  activity_type text not null,
  name text,
  distance_m numeric(10,1) not null check (distance_m >= 0),
  moving_time_s int not null default 0,
  start_date timestamptz not null,
  unique (source, external_id)
);
create index activities_user_date_idx on public.activities (user_id, start_date desc);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  owner_id uuid not null references public.profiles(id),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 60),
  primary key (group_id, user_id),
  -- MVP rule: one group per user. DROP this constraint when you ship multi-group.
  constraint one_group_per_user unique (user_id)
);

create table public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);

-- ------------------------------------------------------- helper functions

create function public.max_group_size() returns int language sql immutable as $$ select 10 $$;

create function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members
                 where group_id = p_group and user_id = auth.uid())
$$;

create function public.shares_group_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members a
                 join public.group_members b on a.group_id = b.group_id
                 where a.user_id = auth.uid() and b.user_id = p_user)
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                  'Runner'), 40),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Throttle group-code guessing: 15 lookups per 10 minutes per user.
create function public.check_join_rate() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.join_attempts where at < now() - interval '1 hour';
  if (select count(*) from public.join_attempts
      where user_id = auth.uid() and at > now() - interval '10 minutes') >= 15 then
    raise exception 'Too many attempts. Try again in a few minutes.';
  end if;
  insert into public.join_attempts (user_id) values (auth.uid());
end $$;

-- ------------------------------------------------------ group functions

create function public.create_group(p_name text, p_timezone text default 'UTC')
returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  c text;
  i int;
  tz text := 'UTC';
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if exists (select 1 from public.group_members where user_id = uid) then
    raise exception 'You are already in a group.';
  end if;
  p_name := btrim(p_name);
  if char_length(p_name) not between 1 and 40 then
    raise exception 'Group name must be 1-40 characters.';
  end if;
  if exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    tz := p_timezone;
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  insert into public.groups (name, code, owner_id, timezone)
    values (p_name, c, uid, tz) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return g;
end $$;

create function public.preview_group(p_code text)
returns table (group_name text, member_count int, is_full boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  perform public.check_join_rate();
  return query
    select g.name, count(m.user_id)::int, count(m.user_id) >= public.max_group_size()
    from public.groups g
    left join public.group_members m on m.group_id = g.id
    where g.code = upper(btrim(p_code))
    group by g.id;
end $$;

-- Returns 'ok' | 'not_found' | 'full' | 'already_in_group'
create function public.join_group(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  n int;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  perform public.check_join_rate();
  if exists (select 1 from public.group_members where user_id = uid) then
    return 'already_in_group';
  end if;
  select * into g from public.groups where code = upper(btrim(p_code)) for update; -- serialises joins
  if not found then return 'not_found'; end if;
  select count(*) into n from public.group_members where group_id = g.id;
  if n >= public.max_group_size() then return 'full'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return 'ok';
end $$;

create function public.leave_group() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  select group_id into gid from public.group_members where user_id = uid;
  if gid is null then return; end if;
  delete from public.group_members where user_id = uid;
  if not exists (select 1 from public.group_members where group_id = gid) then
    delete from public.groups where id = gid;
  else
    update public.groups set owner_id = (
      select user_id from public.group_members where group_id = gid order by joined_at limit 1
    ) where id = gid and owner_id = uid;
  end if;
end $$;

-- Start/end of a week for a group, in the group's timezone (weeks start Monday).
create function public.group_week_range(p_group_id uuid, p_weeks_ago int default 0)
returns table (week_start timestamptz, week_end timestamptz, tz text)
language plpgsql stable security definer set search_path = '' as $$
declare z text;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Not a member.'; end if;
  select g.timezone into z from public.groups g where g.id = p_group_id;
  return query select
    (date_trunc('week', now() at time zone z) - make_interval(weeks => p_weeks_ago)) at time zone z,
    (date_trunc('week', now() at time zone z) - make_interval(weeks => p_weeks_ago - 1)) at time zone z,
    z;
end $$;

-- p_weeks_ago = 0 is this week, 1 is last week, ...
-- p_weeks_ago = null is the overall board: each member counted since THEY joined.
-- Members only see totals, never each other's individual activities.
create function public.group_standings(p_group_id uuid, p_weeks_ago int default null)
returns table (user_id uuid, display_name text, avatar_url text, note text, distance_m numeric)
language plpgsql stable security definer set search_path = '' as $$
declare w_from timestamptz; w_to timestamptz;
begin
  if not public.is_group_member(p_group_id) then raise exception 'Not a member.'; end if;
  if p_weeks_ago is not null then
    select wr.week_start, wr.week_end into w_from, w_to
    from public.group_week_range(p_group_id, p_weeks_ago) wr;
  end if;
  return query
    select m.user_id, p.display_name, p.avatar_url, m.note,
           coalesce(sum(a.distance_m), 0)::numeric
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    left join public.activities a
      on a.user_id = m.user_id
     and ((p_weeks_ago is null and a.start_date >= m.joined_at)
       or (p_weeks_ago is not null and a.start_date >= w_from and a.start_date < w_to))
    where m.group_id = p_group_id
    group by m.user_id, p.display_name, p.avatar_url, m.note
    order by 5 desc, p.display_name;
end $$;

-- ------------------------------------------------------------------ RLS

alter table public.profiles       enable row level security;
alter table public.strava_links   enable row level security;
alter table public.strava_tokens  enable row level security;
alter table public.activities     enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.join_attempts  enable row level security;

create policy "read self or groupmates" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group_with(id));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "read own strava link" on public.strava_links
  for select to authenticated using (user_id = auth.uid());

create policy "read own activities" on public.activities
  for select to authenticated using (user_id = auth.uid());

create policy "members read group" on public.groups
  for select to authenticated using (public.is_group_member(id));

create policy "members read membership" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "update own note" on public.group_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------- grants
-- Least privilege: strip Supabase's defaults, then grant only what is needed.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

grant select on public.profiles, public.strava_links, public.activities,
                public.groups, public.group_members to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (note) on public.group_members to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_group_member(uuid), public.shares_group_with(uuid),
  public.create_group(text, text), public.preview_group(text), public.join_group(text),
  public.leave_group(), public.group_week_range(uuid, int), public.group_standings(uuid, int)
to authenticated;
