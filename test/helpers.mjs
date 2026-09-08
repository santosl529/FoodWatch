/**
 * Shared fixtures for the integration suites.
 *
 * These talk to the real Supabase project — the logic under test is Postgres
 * triggers and RLS, which a mock would not exercise. Fixtures create and delete
 * their own users and posts; anything left behind is prefixed `lifecycle-test-`
 * and safe to remove.
 */
export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const secret = process.env.SUPABASE_SECRET_KEY;
export const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !secret) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run via `npm test`, which loads .env.local.",
  );
}

export const headers = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};

export async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${text}`);
  }
  return body;
}

/** Like rest(), but returns the error instead of throwing — for negative tests. */
export async function restExpectingFailure(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  return { status: response.status, body: await response.text() };
}

export async function createUser(localPart) {
  const email = `lifecycle-test-${localPart}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@upenn.edu`;
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`createUser: ${JSON.stringify(body)}`);
  return { id: body.id, email };
}

export async function deleteUser(id) {
  if (!id) return;
  await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers });
}

export async function createPost(creatorId, overrides = {}) {
  const [post] = await rest("posts?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      creator_id: creatorId,
      description: "lifecycle-test post",
      photo_path: `${creatorId}/00000000-0000-0000-0000-000000000000.jpg`,
      servings_remaining: 4,
      location: "SRID=4326;POINT(-75.1932 39.9522)",
      location_label: "Test Building",
      dietary_tags: ["meal"],
      ...overrides,
    }),
  });
  return post;
}

export async function getPost(id) {
  const [post] = await rest(`posts?id=eq.${id}&select=*`);
  return post;
}

export async function addEvent(postId, userId, type, servingsValue = null) {
  return rest("availability_events", {
    method: "POST",
    body: JSON.stringify({
      post_id: postId,
      user_id: userId,
      type,
      servings_value: servingsValue,
    }),
  });
}

/** Mints a real user session, for tests that must not bypass RLS. */
export async function sessionFor(email) {
  const gen = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const { email_otp } = await gen.json();

  const verify = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, token: email_otp, type: "email" }),
  });
  const { access_token } = await verify.json();
  if (!access_token) throw new Error(`no session for ${email}`);
  return access_token;
}

export function asUser(token) {
  return {
    apikey: publishable,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
