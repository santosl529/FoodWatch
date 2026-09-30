-- 0011_building_match_ignores_details.sql
-- Watched-building notifications compare only the place part of a post's label.
--
-- Since location autofill (9f), labels look like "Levine Hall · room 101", so
-- 0010's whole-label equality meant watching "Levine Hall" missed nearly every
-- post there. Only the building clause changes; the function is otherwise
-- identical to 0010.
--
-- Known gap: a watch list entry must use the same name posts store (the
-- canonical name), so nicknames like "JMHH" won't match until settings gets the
-- same autofill.

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
          -- Compare the place only: the create form stores
          -- "<place> · <room/floor details>" (9f), and a watcher of
          -- "Levine Hall" means every room in it. split_part returns the whole
          -- label when there is no separator, so plain labels still match.
          where lower(trim(watched.label))
              = lower(trim(split_part(new.location_label, ' · ', 1)))
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
