-- Screenshot / manual entries. Run after 002_consent.sql.
-- The browser never inserts into `activities` directly: these functions validate everything.

create sequence public.manual_activity_seq;
alter table public.activities add column created_at timestamptz not null default now();

create function public.add_manual_activity(
  p_distance_m numeric, p_moving_time_s int, p_start_date timestamptz, p_type text default 'Run'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if not public.has_consent() then raise exception 'Please accept the sharing agreement first.'; end if;
  if p_type not in ('Run', 'Walk') then raise exception 'Activity type must be Run or Walk.'; end if;
  if p_distance_m is null or p_distance_m < 100 or p_distance_m > 100000 then
    raise exception 'Distance must be between 0.1 and 100 km.';
  end if;
  if p_moving_time_s is null or p_moving_time_s < 60 or p_moving_time_s > 86400 then
    raise exception 'Time must be between 1 minute and 24 hours.';
  end if;
  -- Pace sanity: faster than 2:30 /km or slower than 25:00 /km is almost certainly a typo.
  if p_moving_time_s / (p_distance_m / 1000.0) not between 150 and 1500 then
    raise exception 'That distance and time give an unrealistic pace. Please check them.';
  end if;
  -- Backdating is limited so past weekly boards stay trustworthy.
  if p_start_date > now() + interval '1 hour' or p_start_date < now() - interval '14 days' then
    raise exception 'Pick a date within the last 14 days.';
  end if;
  if (select count(*) from public.activities
      where user_id = uid and source = 'manual' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Daily limit reached. Try again tomorrow.';
  end if;
  if exists (select 1 from public.activities
             where user_id = uid
               and abs(distance_m - p_distance_m) < 50
               and abs(moving_time_s - p_moving_time_s) < 30
               and abs(extract(epoch from (start_date - p_start_date))) < 86400) then
    raise exception 'This looks like a duplicate of an activity you already have.';
  end if;

  insert into public.activities (user_id, source, external_id, activity_type, name, distance_m, moving_time_s, start_date)
  values (uid, 'manual', nextval('public.manual_activity_seq'), p_type, 'Added by you',
          round(p_distance_m, 1), p_moving_time_s, p_start_date)
  returning id into new_id;
  return new_id;
end $$;

-- People can only remove entries they added themselves, never Strava imports.
create function public.delete_manual_activity(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  delete from public.activities where id = p_id and user_id = auth.uid() and source = 'manual'
$$;

revoke all on function public.add_manual_activity(numeric, int, timestamptz, text), public.delete_manual_activity(bigint) from public, anon;
grant execute on function public.add_manual_activity(numeric, int, timestamptz, text), public.delete_manual_activity(bigint) to authenticated;
