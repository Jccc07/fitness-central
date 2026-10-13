-- Consent: members agree that their weekly/overall distance is shown to their group.
-- Run after 001_init.sql.

create table public.consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version int not null,
  accepted_at timestamptz not null default now()
);
alter table public.consents enable row level security;
create policy "read own consent" on public.consents
  for select to authenticated using (user_id = auth.uid());
grant select on public.consents to authenticated;

-- Writes only through these functions.
create function public.accept_consent(p_version int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  insert into public.consents (user_id, version, accepted_at)
  values (auth.uid(), p_version, now())
  on conflict (user_id) do update set version = excluded.version, accepted_at = now();
end $$;

-- Withdraw: leave the group (so nothing of theirs is shown) and remove the consent record.
create function public.withdraw_consent() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.leave_group();
  delete from public.consents where user_id = auth.uid();
end $$;

create function public.has_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents where user_id = auth.uid())
$$;

-- Database-level guard: no consent, no group.
create or replace function public.create_group(p_name text, p_timezone text default 'UTC')
returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text; i int; tz text := 'UTC';
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if not public.has_consent() then raise exception 'Please accept the sharing agreement first.'; end if;
  if exists (select 1 from public.group_members where user_id = uid) then
    raise exception 'You are already in a group.';
  end if;
  p_name := btrim(p_name);
  if char_length(p_name) not between 1 and 40 then raise exception 'Group name must be 1-40 characters.'; end if;
  if exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then tz := p_timezone; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  insert into public.groups (name, code, owner_id, timezone) values (p_name, c, uid, tz) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return g;
end $$;

create or replace function public.join_group(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); g public.groups; n int;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if not public.has_consent() then raise exception 'Please accept the sharing agreement first.'; end if;
  perform public.check_join_rate();
  if exists (select 1 from public.group_members where user_id = uid) then return 'already_in_group'; end if;
  select * into g from public.groups where code = upper(btrim(p_code)) for update;
  if not found then return 'not_found'; end if;
  select count(*) into n from public.group_members where group_id = g.id;
  if n >= public.max_group_size() then return 'full'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid);
  return 'ok';
end $$;

revoke all on function public.accept_consent(int), public.withdraw_consent(), public.has_consent() from public, anon;
grant execute on function public.accept_consent(int), public.withdraw_consent(), public.has_consent() to authenticated;
revoke all on function public.create_group(text, text), public.join_group(text) from public, anon;
grant execute on function public.create_group(text, text), public.join_group(text) to authenticated;
