-- 0006_lifecycle.sql
-- Step 5a: availability lifecycle (PRD §6.1) + feed ranking (PRD §6.3).
--
-- All of this lives in Postgres rather than the Next app for three reasons:
--   1. The close rules must fire atomically with the write that triggers them.
--      Two students tapping "it's gone" at once is a race application code
--      loses; a trigger inside the same transaction cannot.
--   2. Ranking needs PostGIS distance anyway.
--   3. A future iOS client calls the same functions instead of reimplementing
--      the rules and drifting out of sync.
--
-- Availability events are the SOURCE OF TRUTH: a client inserts a row into
-- availability_events and these triggers apply the consequences to posts. That
-- keeps writes to one statement and matches the append-only RLS on the table.

-- =========================================================
-- Tunable constants (PRD §6.1)
-- =========================================================
-- Kept as functions so they are documented and changeable in one place without
-- hunting through trigger bodies. Inlined by the planner; cost is nil.
create or replace function public.gone_report_threshold()
returns int language sql immutable as $$ select 2 $$;

create or replace function public.post_max_age()
returns interval language sql immutable as $$ select interval '3 hours' $$;

-- =========================================================
-- (b) servings reaching zero closes the post
-- =========================================================
-- A BEFORE trigger mutating NEW, rather than an AFTER trigger issuing another
-- UPDATE — no recursion, and it applies to every path that changes servings.
create or replace function public.apply_post_close_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.servings_remaining = 0
     and new.status = 'active' then
    new.status       := 'closed';
    new.closed_at    := now();
    new.close_reason := 'zero_servings';
  end if;
  return new;
end;
$$;

create trigger post_close_rules
  before update on public.posts
  for each row execute procedure public.apply_post_close_rules();

-- =========================================================
-- Availability events drive servings, bumps, and crowd-closing
-- =========================================================
create or replace function public.handle_availability_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  distinct_gone_reports int;
  post_creator uuid;
begin
  select creator_id into post_creator
  from public.posts
  where id = new.post_id;

  if new.type = 'bump' then
    -- availability_events' RLS only checks that user_id = auth.uid(), so
    -- without this guard any student could insert a 'bump' row and re-surface
    -- someone else's post — routing around the creator-only rule that
    -- check_post_update_permissions enforces on posts.bumped_at.
    if new.user_id is distinct from post_creator then
      raise exception 'Only the post creator can bump a post';
    end if;

    update public.posts
       set bumped_at        = now(),
           last_activity_at = now()
     where id = new.post_id;

    return new;
  end if;

  if new.type = 'servings_update' then
    if new.servings_value is null then
      raise exception 'servings_update events must carry a servings_value';
    end if;

    -- The BEFORE trigger above closes the post if this lands on zero.
    update public.posts
       set servings_remaining = greatest(new.servings_value, 0),
           last_activity_at   = now()
     where id = new.post_id;

    return new;
  end if;

  if new.type = 'gone_report' then
    -- The partial unique index from 0002 already limits one gone_report per
    -- user per post, so this count is inherently of distinct users.
    select count(*) into distinct_gone_reports
    from public.availability_events
    where post_id = new.post_id
      and type = 'gone_report';

    update public.posts
       set last_activity_at = now(),
           status = case
             when distinct_gone_reports >= public.gone_report_threshold()
               then 'closed' else status end,
           closed_at = case
             when distinct_gone_reports >= public.gone_report_threshold()
                  and status = 'active'
               then now() else closed_at end,
           close_reason = case
             when distinct_gone_reports >= public.gone_report_threshold()
                  and status = 'active'
               then 'crowd_reports' else close_reason end
     where id = new.post_id;

    return new;
  end if;

  return new;
end;
$$;

create trigger availability_event_applied
  after insert on public.availability_events
  for each row execute procedure public.handle_availability_event();

-- =========================================================
-- Comments count as activity (PRD §6.1)
-- =========================================================
create or replace function public.touch_post_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
     set last_activity_at = now()
   where id = new.post_id;
  return new;
end;
$$;

create trigger comment_touches_post
  after insert on public.comments
  for each row execute procedure public.touch_post_on_comment();

-- =========================================================
-- Feed ranking (PRD §6.3)
-- =========================================================
-- score = 0.6*recency + 0.3*distance + 0.1*servings, recency dominant.
-- Rule (d), the backstop auto-expire, is applied lazily here rather than by a
-- scheduled job: a post past MAX_AGE simply stops appearing, with no job
-- latency and no pg_cron dependency. Such rows keep status='active' until
-- something touches them; add a sweep later if that tidiness matters.
create or replace function public.feed_posts(
  user_lat double precision default null,
  user_lng double precision default null
)
returns table (
  id                 uuid,
  creator_id         uuid,
  creator_name       text,
  description        text,
  photo_path         text,
  servings_remaining int,
  location_label     text,
  dietary_tags       text[],
  latitude           double precision,
  longitude          double precision,
  distance_meters    double precision,
  comment_count      bigint,
  created_at         timestamptz,
  bumped_at          timestamptz,
  last_activity_at   timestamptz,
  score              double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with viewer as (
    select case
             when user_lat is null or user_lng is null then null
             else extensions.st_setsrid(
                    extensions.st_makepoint(user_lng, user_lat), 4326
                  )::extensions.geography
           end as location
  )
  select
    p.id,
    p.creator_id,
    pr.display_name as creator_name,
    p.description,
    p.photo_path,
    p.servings_remaining,
    p.location_label,
    p.dietary_tags,
    extensions.st_y(p.location::extensions.geometry) as latitude,
    extensions.st_x(p.location::extensions.geometry) as longitude,
    case when v.location is null then null
         else extensions.st_distance(p.location, v.location) end
      as distance_meters,
    (select count(*) from public.comments c where c.post_id = p.id)
      as comment_count,
    p.created_at,
    p.bumped_at,
    p.last_activity_at,
    (
      -- recency: exponential decay on the fresher of created/bumped.
      -- ~0.51 at one hour, ~0.26 at two.
      0.6 * exp(
        -(extract(epoch from (now() - greatest(p.created_at, coalesce(p.bumped_at, p.created_at)))) / 60.0)
        / 90.0
      )
      -- distance: 1 at the same spot, 0.5 at 500 m, 0.2 at 2 km.
      -- Omitted entirely when the viewer has no location (PRD §6.3 fallback).
      + case when v.location is null then 0.0
             else 0.3 * (1.0 / (1.0 + extensions.st_distance(p.location, v.location) / 500.0))
        end
      -- servings: small nudge, saturating at 10.
      + 0.1 * (least(p.servings_remaining, 10)::double precision / 10.0)
    ) as score
  from public.posts p
  join public.profiles pr on pr.id = p.creator_id
  cross join viewer v
  where p.status = 'active'
    and p.last_activity_at > now() - public.post_max_age()
  order by score desc, p.created_at desc
$$;

grant execute on function public.feed_posts(double precision, double precision)
  to authenticated;

-- =========================================================
-- Realtime for comments (PRD §5.4 — live thread)
-- =========================================================
do $$
begin
  alter publication supabase_realtime add table public.comments;
exception
  when duplicate_object then null;
end $$;
