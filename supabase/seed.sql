-- supabase/seed.sql
-- Development seed: two test Penn users, one student and one admin.
--
-- LOCAL DEV (supabase CLI):
--   Run automatically via `supabase db reset`, or manually with:
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- REMOTE / STAGING:
--   Run ONLY the UPDATE at the bottom of this file. Create the users first via
--   the dashboard (Authentication → Users) or by signing in through the app;
--   the handle_new_user trigger creates their profile rows automatically.

-- ⚠️ LOCAL DEV ONLY — DO NOT RUN THIS INSERT AGAINST A REMOTE PROJECT.
-- Hand-written auth.users rows are accepted by Postgres but are not valid
-- GoTrue users: without instance_id, and with NULL token columns, they are
-- invisible to the Auth admin API and cannot sign in. We hit exactly this on
-- the remote project and had to delete the rows again. instance_id and the
-- token columns are set explicitly below because GoTrue filters on the former
-- and fails to scan NULLs into strings for the latter.
insert into auth.users (
  id,
  instance_id,
  email,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
) values
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'student@upenn.edu',
    now(), now(), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Test Student"}',
    'authenticated',
    'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'admin@upenn.edu',
    now(), now(), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Admin"}',
    'authenticated',
    'authenticated'
  )
on conflict (id) do nothing;

-- The handle_new_user trigger creates profile rows on auth.users insert, with
-- display_name defaulting to the email local-part (see 0004_auth_hook.sql).
-- This statement overrides those defaults and promotes the admin user.
--
-- ON REMOTE, THIS IS THE ONLY STATEMENT YOU SHOULD RUN — and only after the
-- users exist. Match on email rather than a hardcoded id, since dashboard- and
-- app-created users get random uuids.
update public.profiles
   set display_name = case email
         when 'student@upenn.edu' then 'Test Student'
         when 'admin@upenn.edu'   then 'Admin'
         else display_name
       end,
       role = case email
         when 'admin@upenn.edu' then 'admin'
         else role
       end
 where email in ('student@upenn.edu', 'admin@upenn.edu');
