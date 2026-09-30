-- 0010_notify_everything.sql
-- Reverses the notification default set in 0008.
--
-- 0008 required a radius or a watched building before anyone heard about a new
-- post; configure nothing and you got nothing. That is the right default for a
-- large app, but wrong for this one. Penn Free Food replaces a group chat where
-- everybody saw every message, on one campus small enough that "everything" is
-- a reasonable amount of everything. Silence-by-default also means a student who
-- never opens settings — most of them — quietly gets no value from the feature.
--
-- New behaviour:
--   * No location preferences at all (or no preferences row)  -> notified about
--     every post, subject to the dietary filter.
--   * A radius and centre set                                 -> only inside it.
--   * Watched buildings set                                   -> only those.
--   * Both set                                                -> either matches.
--   * The poster is never notified about their own post.
--
-- The dietary filter still applies in every case: allergen avoidance is not a
-- preference to override.

create or replace function public.notify_on_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Driven from `profiles`, not `notification_preferences`: a user who has
  -- never opened settings has no preferences row, and they are precisely the
  -- people this default exists for.
  insert into public.notifications (user_id, post_id, type, body)
  select
    p.id,
    new.id,
    'nearby_post',
    -- User-authored text; every surface rendering it must escape (React does).
    left(new.description, 120) || ' · ' || new.location_label
  from public.profiles p
  left join public.notification_preferences prefs on prefs.user_id = p.id
  where
    p.id <> new.creator_id
    and (
      -- Nothing configured: tell them about everything.
      (
        (prefs.center is null or prefs.radius_meters is null)
        and coalesce(array_length(prefs.building_labels, 1), 0) = 0
      )
      -- Inside their radius.
      or (
        prefs.center is not null
        and prefs.radius_meters is not null
        and extensions.st_dwithin(new.location, prefs.center, prefs.radius_meters)
      )
      -- One of their watched buildings.
      or (
        coalesce(array_length(prefs.building_labels, 1), 0) > 0
        and exists (
          select 1
          from unnest(prefs.building_labels) as watched(label)
          where lower(watched.label) = lower(new.location_label)
        )
      )
    )
    and public.post_matches_dietary_filter(
      new.dietary_tags,
      coalesce(prefs.dietary_filter, '{}'::jsonb)
    );

  return new;
end;
$$;
