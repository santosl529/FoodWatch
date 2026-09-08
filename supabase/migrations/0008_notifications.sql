-- 0008_notifications.sql
-- Step 8a: server-side notification fan-out (PRD §5.6, §6.6).
--
-- AUTHORIZATION NOTE
-- This is the third table whose rows affect *other* users, after `bump` and
-- `posts.status`. Both earlier cases were exploitable because RLS checked row
-- ownership while the row's side effects reached elsewhere. The rule applied
-- here: a notification's recipient is derived solely from that recipient's own
-- stored preferences, computed inside a SECURITY DEFINER trigger. Nothing the
-- poster or commenter supplies can select who gets notified. `notifications`
-- keeps no user INSERT policy (0003), so these triggers are the only writer.
--
-- DIETARY FILTER SHAPE
-- `notification_preferences.dietary_filter` is jsonb, undefined until now:
--   {"require": ["vegetarian"], "exclude": ["contains-nuts"]}
-- A post matches when it carries every `require` tag and none of `exclude`.
-- Both keys are optional; `{}` matches everything.

-- =========================================================
-- Dietary filter matching
-- =========================================================
create or replace function public.post_matches_dietary_filter(
  post_tags text[],
  filter jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  required text[];
  excluded text[];
begin
  if filter is null or filter = '{}'::jsonb then
    return true;
  end if;

  select coalesce(array(select jsonb_array_elements_text(filter -> 'require')), '{}')
    into required;
  select coalesce(array(select jsonb_array_elements_text(filter -> 'exclude')), '{}')
    into excluded;

  -- Every required tag must be present.
  if array_length(required, 1) is not null and not (post_tags @> required) then
    return false;
  end if;

  -- No excluded tag may be present.
  if array_length(excluded, 1) is not null and (post_tags && excluded) then
    return false;
  end if;

  return true;
end;
$$;

-- =========================================================
-- Fan-out on new post
-- =========================================================
create or replace function public.notify_on_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.notifications (user_id, post_id, type, body)
  select
    prefs.user_id,
    new.id,
    'nearby_post',
    -- Body is assembled from the post's own fields. They are user-authored, so
    -- every surface rendering this must escape it — React does by default.
    left(new.description, 120) || ' · ' || new.location_label
  from public.notification_preferences prefs
  where
    -- Never notify the poster about their own post.
    prefs.user_id <> new.creator_id
    -- Location match: inside the radius, OR one of their watched buildings.
    -- A user with neither configured gets no nearby-post notifications, which
    -- is the correct default — silence until they opt in.
    and (
      (
        prefs.center is not null
        and prefs.radius_meters is not null
        and extensions.st_dwithin(new.location, prefs.center, prefs.radius_meters)
      )
      or (
        array_length(prefs.building_labels, 1) is not null
        and exists (
          select 1
          from unnest(prefs.building_labels) as watched(label)
          where lower(watched.label) = lower(new.location_label)
        )
      )
    )
    -- Dietary filter must also match (PRD §6.6: location AND dietary).
    and public.post_matches_dietary_filter(new.dietary_tags, prefs.dietary_filter);

  return new;
end;
$$;

create trigger notify_on_new_post
  after insert on public.posts
  for each row execute procedure public.notify_on_new_post();

-- =========================================================
-- Comment notifications go to the post's creator only
-- =========================================================
create or replace function public.notify_on_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_creator uuid;
  wants_comments boolean;
begin
  select creator_id into post_creator
  from public.posts
  where id = new.post_id;

  -- Don't notify someone about their own comment.
  if post_creator is null or post_creator = new.author_id then
    return new;
  end if;

  -- Default true when the creator has no preferences row at all: replies to
  -- your own post are the one notification worth having by default.
  select coalesce(prefs.notify_on_comment, true) into wants_comments
  from (select 1) as ignored
  left join public.notification_preferences prefs on prefs.user_id = post_creator;

  if not coalesce(wants_comments, true) then
    return new;
  end if;

  insert into public.notifications (user_id, post_id, type, body)
  values (
    post_creator,
    new.post_id,
    'comment',
    'New comment: ' || left(new.body, 120)
  );

  return new;
end;
$$;

create trigger notify_on_new_comment
  after insert on public.comments
  for each row execute procedure public.notify_on_new_comment();

-- =========================================================
-- Realtime for the notification badge (PRD §6.6)
-- =========================================================
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
