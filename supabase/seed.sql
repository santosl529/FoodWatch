-- supabase/seed.sql
-- Development seed: two test Penn users, one student and one admin.
--
-- LOCAL DEV (supabase CLI):
--   Run automatically via `supabase db reset`, or manually with:
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- REMOTE / STAGING:
--   Create users through the Supabase dashboard (Authentication → Users)
--   using the emails below. The handle_new_user trigger will auto-create
--   their profile rows. Then run only the UPDATE statements at the bottom
--   to set the admin role and display names.

-- Insert test auth users directly (local dev only — direct auth.users writes
-- are not possible on remote Supabase; use the dashboard or Admin API there).
insert into auth.users (
  id,
  email,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
) values
  (
    '00000000-0000-0000-0000-000000000001',
    'student@upenn.edu',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Test Student"}',
    'authenticated',
    'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'admin@upenn.edu',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Admin"}',
    'authenticated',
    'authenticated'
  )
on conflict (id) do nothing;

-- The handle_new_user trigger creates profile rows on auth.users insert.
-- Set display names and promote the admin user.
-- Use ON CONFLICT in case seed is re-run after a partial run.
insert into public.profiles (id, email, display_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'student@upenn.edu', 'Test Student', 'student'),
  ('00000000-0000-0000-0000-000000000002', 'admin@upenn.edu',   'Admin',        'admin')
on conflict (id) do update
  set display_name = excluded.display_name,
      role         = excluded.role;
