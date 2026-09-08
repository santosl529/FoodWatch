-- 0009_moderation.sql
-- Step 9: light anti-abuse and admin moderation (PRD §12 step 9, §3 roles).

-- =========================================================
-- Rate-limit gone reports
-- =========================================================
-- The partial unique index from 0002 already stops one user reporting the same
-- post twice. This limits the other shape of abuse: one user walking the feed
-- and reporting *every* post gone. Two such users could otherwise close the
-- whole board, since the threshold is 2.
--
-- Deliberately generous — a student legitimately clearing out a stale feed
-- after an event should not trip it. The point is to make mass griefing
-- inconvenient, not to police normal use (PRD §6.1: "don't over-build
-- moderation for the MVP").
create or replace function public.gone_report_hourly_limit()
returns int language sql immutable as $$ select 12 $$;

create or replace function public.rate_limit_gone_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  if new.type <> 'gone_report' then
    return new;
  end if;

  select count(*) into recent_count
  from public.availability_events
  where user_id = new.user_id
    and type = 'gone_report'
    and created_at > now() - interval '1 hour';

  if recent_count >= public.gone_report_hourly_limit() then
    raise exception
      'Too many gone reports in the last hour. Try again later.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger rate_limit_gone_reports
  before insert on public.availability_events
  for each row execute procedure public.rate_limit_gone_reports();

-- =========================================================
-- Admin moderation deletes
-- =========================================================
-- 0003 left admin deletes to the secret-key client, which bypasses RLS
-- entirely. Expressing it as a policy is better: the rule lives with the other
-- access rules, admins act as themselves rather than as an all-powerful
-- client, and no secret key needs to reach the delete path.
--
-- Self-promotion to admin is already blocked by the prevent_role_change
-- trigger in 0002, so `role = 'admin'` cannot be granted by the user holding it.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "posts_delete_admin"
  on public.posts
  for delete
  to authenticated
  using (public.is_admin());

create policy "comments_delete_admin"
  on public.comments
  for delete
  to authenticated
  using (public.is_admin());
