-- 0002_schema.sql
-- Step 2: Create all application tables (PRD §7) plus helper functions and
-- triggers that enforce business rules at the DB level.
-- RLS policies are in 0003_rls.sql.

-- =========================================================
-- profiles
-- One row per auth user; created automatically by handle_new_user trigger.
-- =========================================================
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  display_name text,
  role         text not null default 'student' check (role in ('student', 'admin')),
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Prevent non-admin users from elevating their own role.
-- auth.uid() is null when called via the admin (secret-key) client; those
-- calls are allowed through unrestricted.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    ) then
      raise exception 'Only admins can change roles';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_role_immutability
  before update on public.profiles
  for each row execute procedure public.prevent_role_change();

-- =========================================================
-- posts
-- =========================================================
create table public.posts (
  id                 uuid        primary key default gen_random_uuid(),
  creator_id         uuid        not null references public.profiles(id) on delete cascade,
  description        text        not null,
  photo_path         text        not null,
  servings_remaining int         not null default 1 check (servings_remaining >= 0),
  status             text        not null default 'active' check (status in ('active', 'closed')),
  location           extensions.geography(Point, 4326) not null,
  location_label     text        not null,
  dietary_tags       text[]      not null default '{}',
  ai_suggested       jsonb,
  created_at         timestamptz not null default now(),
  bumped_at          timestamptz,
  last_activity_at   timestamptz not null default now(),
  closed_at          timestamptz,
  close_reason       text        check (close_reason in ('creator', 'zero_servings', 'crowd_reports', 'expired'))
);

create index posts_location_gist     on public.posts using gist (location);
create index posts_status_idx        on public.posts (status);
create index posts_last_activity_idx on public.posts (last_activity_at);

-- Prevent non-creator authenticated users from modifying creator-only fields
-- (description, photo_path, bumped_at). Any student may still update crowd-
-- sourced fields (servings_remaining, status, close_reason, closed_at,
-- last_activity_at). auth.uid() is null for admin-client calls; allowed through.
create or replace function public.check_post_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if auth.uid() is distinct from old.creator_id then
    if (new.description  is distinct from old.description  or
        new.photo_path   is distinct from old.photo_path   or
        new.bumped_at    is distinct from old.bumped_at) then
      raise exception 'Only the post creator can update this field';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_post_update_permissions
  before update on public.posts
  for each row execute procedure public.check_post_update_permissions();

-- =========================================================
-- comments
-- =========================================================
create table public.comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  author_id  uuid        not null references public.profiles(id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now()
);

create index comments_post_id_idx on public.comments (post_id);

-- =========================================================
-- availability_events
-- Immutable log of crowd-sourced actions (gone reports, servings updates, bumps).
-- Enables distinct-user thresholds (PRD §6.1) and abuse tracing.
-- =========================================================
create table public.availability_events (
  id             uuid        primary key default gen_random_uuid(),
  post_id        uuid        not null references public.posts(id) on delete cascade,
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  type           text        not null check (type in ('gone_report', 'servings_update', 'bump')),
  servings_value int,
  created_at     timestamptz not null default now()
);

create index availability_events_post_id_idx on public.availability_events (post_id);

-- One gone_report per user per post (PRD §6.1 — repeated reports count once).
create unique index availability_events_one_gone_report_per_user
  on public.availability_events (post_id, user_id)
  where type = 'gone_report';

-- =========================================================
-- notification_preferences
-- =========================================================
create table public.notification_preferences (
  user_id           uuid    primary key references public.profiles(id) on delete cascade,
  radius_meters     int,
  center            extensions.geography(Point, 4326),
  building_labels   text[]  not null default '{}',
  dietary_filter    jsonb   not null default '{}',
  notify_on_comment boolean not null default true,
  web_push_enabled  boolean not null default false
);

-- =========================================================
-- push_subscriptions
-- =========================================================
create table public.push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  subscription jsonb       not null,
  created_at   timestamptz not null default now()
);

-- =========================================================
-- notifications (in-app; always works regardless of push support)
-- Inserted server-side only (admin client); no user-facing INSERT policy.
-- =========================================================
create table public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  post_id    uuid        references public.posts(id) on delete set null,
  type       text        not null check (type in ('nearby_post', 'comment', 'system')),
  body       text        not null,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);
