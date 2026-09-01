-- 0003_rls.sql
-- Step 2: Row-Level Security policies for all tables (PRD §8).
-- Default-deny: RLS is enabled first; every permission granted explicitly.
-- Admin moderation deletes (posts, comments) use the server-side admin client
-- which bypasses RLS — no separate admin policy needed here.

-- =========================================================
-- profiles
-- =========================================================
alter table public.profiles enable row level security;

-- Any authenticated user can read profiles (display names on posts/comments).
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Users can only insert their own profile row.
-- In practice this is done by the handle_new_user trigger (security definer),
-- but the policy guards against direct API inserts.
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Users can update their own profile.
-- The prevent_role_change trigger blocks self-promotion to admin.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =========================================================
-- posts
-- =========================================================
alter table public.posts enable row level security;

-- Any authenticated user can read any post (feed, map, detail).
create policy "posts_select"
  on public.posts
  for select
  to authenticated
  using (true);

-- Any authenticated user can create a post as themselves.
create policy "posts_insert"
  on public.posts
  for insert
  to authenticated
  with check (auth.uid() = creator_id);

-- Any authenticated user can update a post (crowd-sourced servings/status).
-- Fine-grained field restrictions (description, photo_path, bumped_at are
-- creator-only) are enforced by the enforce_post_update_permissions trigger.
create policy "posts_update"
  on public.posts
  for update
  to authenticated
  using (true)
  with check (true);

-- Only the creator can delete their own post via the user client.
-- Admin deletes bypass RLS via the server-side admin (secret-key) client.
create policy "posts_delete_own"
  on public.posts
  for delete
  to authenticated
  using (auth.uid() = creator_id);

-- =========================================================
-- comments
-- =========================================================
alter table public.comments enable row level security;

-- Any authenticated user can read comments.
create policy "comments_select"
  on public.comments
  for select
  to authenticated
  using (true);

-- Any authenticated user can post a comment as themselves.
create policy "comments_insert"
  on public.comments
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Only the author can delete their own comment via the user client.
-- Admin deletes bypass RLS via the server-side admin client.
create policy "comments_delete_own"
  on public.comments
  for delete
  to authenticated
  using (auth.uid() = author_id);

-- =========================================================
-- availability_events (immutable log)
-- =========================================================
alter table public.availability_events enable row level security;

-- Any authenticated user can read events (needed for distinct-user counts
-- and for checking whether the current user already filed a gone_report).
create policy "availability_events_select"
  on public.availability_events
  for select
  to authenticated
  using (true);

-- Any authenticated user can log an event attributed to themselves.
create policy "availability_events_insert"
  on public.availability_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE: this is an append-only audit log.

-- =========================================================
-- notification_preferences
-- =========================================================
alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own"
  on public.notification_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notification_preferences_insert_own"
  on public.notification_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "notification_preferences_update_own"
  on public.notification_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notification_preferences_delete_own"
  on public.notification_preferences
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================
-- push_subscriptions
-- =========================================================
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================
-- notifications
-- =========================================================
alter table public.notifications enable row level security;

-- Users can only read their own notifications.
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No INSERT policy for authenticated users: notifications are created server-
-- side via the admin client (bypasses RLS) when posts/comments are created.

-- Users can mark their own notifications read (UPDATE).
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can dismiss their own notifications.
create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (auth.uid() = user_id);
