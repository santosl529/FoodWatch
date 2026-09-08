-- 0007_lifecycle_guard.sql
-- Step 5d: force every availability change through the event log.
--
-- THE HOLE THIS CLOSES
-- RLS on `posts` lets any authenticated student update the crowd-sourced
-- columns, which is what PRD §6.1 wants in spirit — anyone may decrement
-- servings or report food gone. But "any student may update posts.status"
-- literally means one API call closes any post on campus, skipping the
-- GONE_REPORT_THRESHOLD of two distinct users entirely. The same applies to
-- servings_remaining: a direct write leaves no per-user record, so the
-- "logged per-user so abuse can be traced" requirement quietly fails.
--
-- After this migration those columns may only be changed by the lifecycle
-- functions, which run in response to an inserted availability_event and can
-- therefore attribute every change to a user. Creators keep direct control of
-- their own descriptive fields (description, photo_path).

-- Creator-initiated close (rule 6.1a) becomes an event type like the others,
-- so it is attributable and travels the same path.
alter table public.availability_events
  drop constraint if exists availability_events_type_check;

alter table public.availability_events
  add constraint availability_events_type_check
  check (type in ('gone_report', 'servings_update', 'bump', 'creator_close'));

-- =========================================================
-- Lifecycle marker
-- =========================================================
-- Set for the duration of the statement by the lifecycle functions below, and
-- checked by the guard trigger. A user's own UPDATE never has it set, so a
-- direct write to a guarded column is rejected.
create or replace function public.in_lifecycle()
returns boolean
language sql
stable
as $$ select coalesce(current_setting('app.in_lifecycle', true), '') = '1' $$;

-- =========================================================
-- Guard: crowd-sourced columns are event-driven only
-- =========================================================
create or replace function public.guard_post_lifecycle_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin/secret-key calls (auth.uid() is null) are trusted, as elsewhere.
  if auth.uid() is null or public.in_lifecycle() then
    return new;
  end if;

  if new.status             is distinct from old.status
     or new.closed_at          is distinct from old.closed_at
     or new.close_reason       is distinct from old.close_reason
     or new.servings_remaining is distinct from old.servings_remaining
     or new.bumped_at          is distinct from old.bumped_at
     or new.last_activity_at   is distinct from old.last_activity_at then
    raise exception
      'Availability changes must go through availability_events, not a direct update';
  end if;

  return new;
end;
$$;

create trigger guard_post_lifecycle_columns
  before update on public.posts
  for each row execute procedure public.guard_post_lifecycle_columns();

-- =========================================================
-- Lifecycle functions now mark themselves
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

  -- Marks this statement as lifecycle-driven so the guard trigger allows the
  -- writes below. `true` scopes it to the current transaction.
  perform set_config('app.in_lifecycle', '1', true);

  if new.type in ('bump', 'creator_close') then
    -- availability_events' RLS only checks user_id = auth.uid(), so without
    -- this any student could insert one of these rows and act as the creator.
    if new.user_id is distinct from post_creator then
      raise exception 'Only the post creator can do that';
    end if;
  end if;

  if new.type = 'bump' then
    update public.posts
       set bumped_at = now(), last_activity_at = now()
     where id = new.post_id;

  elsif new.type = 'creator_close' then
    update public.posts
       set status           = 'closed',
           closed_at        = now(),
           close_reason     = 'creator',
           last_activity_at = now()
     where id = new.post_id
       and status = 'active';

  elsif new.type = 'servings_update' then
    if new.servings_value is null then
      raise exception 'servings_update events must carry a servings_value';
    end if;

    update public.posts
       set servings_remaining = greatest(new.servings_value, 0),
           last_activity_at   = now()
     where id = new.post_id;

  elsif new.type = 'gone_report' then
    select count(*) into distinct_gone_reports
    from public.availability_events
    where post_id = new.post_id and type = 'gone_report';

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
  end if;

  perform set_config('app.in_lifecycle', '0', true);
  return new;
end;
$$;

create or replace function public.touch_post_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.in_lifecycle', '1', true);
  update public.posts
     set last_activity_at = now()
   where id = new.post_id;
  perform set_config('app.in_lifecycle', '0', true);
  return new;
end;
$$;
