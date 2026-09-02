-- 0004_auth_hook.sql
-- Step 3: server-side @upenn.edu enforcement at the auth boundary (PRD §4, §8).
--
-- This is the ACTUAL security boundary for the domain gate. A check in a server
-- action is not sufficient: the publishable key is public, so any client can
-- call /auth/v1/otp directly and bypass application code. This hook runs inside
-- Supabase Auth before the user row is created, so it cannot be bypassed by any
-- client (web, iOS, curl).
--
-- IMPORTANT — this migration is INERT until the hook is enabled in the
-- dashboard: Authentication → Hooks → Before User Created → Postgres, selecting
-- public.hook_restrict_signup_by_email_domain. Applying the SQL alone does
-- nothing.

-- =========================================================
-- Before User Created hook
-- =========================================================
-- Contract: return '{}'::jsonb to allow the signup; return an object with an
-- `error` key to deny it. The message surfaces to the client, so keep it
-- friendly and non-leaky.
create or replace function public.hook_restrict_signup_by_email_domain(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  user_email text;
  email_domain text;
begin
  user_email := event -> 'user' ->> 'email';

  -- No email at all (e.g. a phone or anonymous signup). This app is email-only,
  -- so deny rather than fall through to an allow.
  if user_email is null or user_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Sign up with your Penn email address.',
        'http_code', 403
      )
    );
  end if;

  -- Compare case-insensitively; addresses are not case-sensitive in practice.
  email_domain := split_part(lower(user_email), '@', 2);

  -- Accept the primary domain plus any school subdomain (engineering.upenn.edu,
  -- sas.upenn.edu, wharton.upenn.edu, nursing.upenn.edu, …). A wildcard beats an
  -- explicit school list because Penn issues addresses under more subdomains
  -- than are worth tracking here, and only Penn controls DNS under upenn.edu.
  -- The LIKE pattern is anchored at the end of the string, so a lookalike domain
  -- such as 'upenn.edu.attacker.com' does NOT match.
  if email_domain <> 'upenn.edu' and email_domain not like '%.upenn.edu' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Penn Free Food is open to Penn students only. Please sign up with your @upenn.edu email address.',
        'http_code', 403
      )
    );
  end if;

  -- Allow.
  return '{}'::jsonb;
end;
$$;

-- Supabase Auth invokes the hook as the supabase_auth_admin role; nobody else
-- should be able to call it.
grant execute
  on function public.hook_restrict_signup_by_email_domain
  to supabase_auth_admin;

revoke execute
  on function public.hook_restrict_signup_by_email_domain
  from authenticated, anon, public;

-- =========================================================
-- Default display_name to the email local-part
-- =========================================================
-- PRD §11 leans toward a low-friction, optional display name. Defaulting here
-- (rather than in the web app) means every client — including a future iOS
-- app — gets the same behaviour with no onboarding screen. Users can still
-- change it later via the profiles_update_own policy.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$;
