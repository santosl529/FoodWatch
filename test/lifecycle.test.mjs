/**
 * Availability lifecycle tests (PRD §6.1) against the real Supabase project.
 *
 * Run with:  npm test
 *
 * Uses Node's built-in test runner — no test framework dependency. These are
 * integration tests by necessity: the logic under test is Postgres triggers, so
 * a mocked unit test would verify nothing. They use the secret key to set up
 * and tear down fixtures, which bypasses RLS; the triggers themselves do not
 * depend on auth.uid(), so the rules exercised here are the real ones.
 *
 * Fixtures are created and deleted per run. Anything left behind is prefixed
 * `lifecycle-test-` and safe to delete.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Run via `npm test`, which loads .env.local.",
  );
}

const headers = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
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
async function restExpectingFailure(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  return { status: response.status, body: await response.text() };
}

async function createUser(localPart) {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: `lifecycle-test-${localPart}-${Date.now()}@upenn.edu`,
      email_confirm: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`createUser: ${JSON.stringify(body)}`);
  return body.id;
}

async function deleteUser(id) {
  await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers });
}

async function createPost(creatorId, overrides = {}) {
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

async function getPost(id) {
  const [post] = await rest(`posts?id=eq.${id}&select=*`);
  return post;
}

async function addEvent(postId, userId, type, servingsValue = null) {
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

describe("availability lifecycle", () => {
  let creator;
  let studentA;
  let studentB;
  const createdPosts = [];

  before(async () => {
    creator = await createUser("creator");
    studentA = await createUser("a");
    studentB = await createUser("b");
  });

  after(async () => {
    for (const id of createdPosts) {
      await rest(`posts?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    for (const id of [creator, studentA, studentB]) {
      if (id) await deleteUser(id);
    }
  });

  async function newPost(overrides) {
    const post = await createPost(creator, overrides);
    createdPosts.push(post.id);
    return post;
  }

  it("(b) closes the post when servings reach zero", async () => {
    const post = await newPost();
    await addEvent(post.id, studentA, "servings_update", 0);

    const updated = await getPost(post.id);
    assert.equal(updated.status, "closed");
    assert.equal(updated.close_reason, "zero_servings");
    assert.ok(updated.closed_at, "closed_at should be set");
  });

  it("(c) stays active after a single gone report", async () => {
    const post = await newPost();
    await addEvent(post.id, studentA, "gone_report");

    const updated = await getPost(post.id);
    assert.equal(updated.status, "active", "one report must not close a post");
  });

  it("(c) closes once two distinct users report it gone", async () => {
    const post = await newPost();
    await addEvent(post.id, studentA, "gone_report");
    await addEvent(post.id, studentB, "gone_report");

    const updated = await getPost(post.id);
    assert.equal(updated.status, "closed");
    assert.equal(updated.close_reason, "crowd_reports");
  });

  it("(c) counts one user's repeated reports only once", async () => {
    const post = await newPost();
    await addEvent(post.id, studentA, "gone_report");
    const second = await restExpectingFailure("availability_events", {
      method: "POST",
      body: JSON.stringify({
        post_id: post.id,
        user_id: studentA,
        type: "gone_report",
      }),
    });

    assert.equal(second.status, 409, "duplicate gone_report should be rejected");
    const updated = await getPost(post.id);
    assert.equal(updated.status, "active");
  });

  it("applies servings updates from the event, not a direct write", async () => {
    const post = await newPost({ servings_remaining: 5 });
    await addEvent(post.id, studentA, "servings_update", 2);

    const updated = await getPost(post.id);
    assert.equal(updated.servings_remaining, 2);
    assert.equal(updated.status, "active");
  });

  it("lets the creator bump, and refuses anyone else", async () => {
    const post = await newPost();

    await addEvent(post.id, creator, "bump");
    const bumped = await getPost(post.id);
    assert.ok(bumped.bumped_at, "creator bump should set bumped_at");

    const stranger = await restExpectingFailure("availability_events", {
      method: "POST",
      body: JSON.stringify({
        post_id: post.id,
        user_id: studentA,
        type: "bump",
      }),
    });
    assert.notEqual(stranger.status, 201, "non-creator bump must be rejected");
    assert.match(stranger.body, /Only the post creator/);
  });

  it("treats a comment as activity", async () => {
    const post = await newPost();
    const before = await getPost(post.id);

    await rest("comments", {
      method: "POST",
      body: JSON.stringify({
        post_id: post.id,
        author_id: studentA,
        body: "is this still there?",
      }),
    });

    const updated = await getPost(post.id);
    assert.ok(
      new Date(updated.last_activity_at) > new Date(before.last_activity_at),
      "a comment should push last_activity_at forward",
    );
  });
});

describe("feed ranking", () => {
  let creator;
  const createdPosts = [];

  before(async () => {
    creator = await createUser("feed");
  });

  after(async () => {
    for (const id of createdPosts) {
      await rest(`posts?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    if (creator) await deleteUser(creator);
  });

  async function callFeed(lat = null, lng = null) {
    return rest("rpc/feed_posts", {
      method: "POST",
      body: JSON.stringify({ user_lat: lat, user_lng: lng }),
    });
  }

  it("(d) hides posts past MAX_AGE without a scheduled job", async () => {
    const stale = await createPost(creator, {
      description: "lifecycle-test stale",
      last_activity_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    });
    createdPosts.push(stale.id);

    const feed = await callFeed();
    assert.ok(
      !feed.some((row) => row.id === stale.id),
      "a post idle beyond MAX_AGE should drop out of the feed",
    );
  });

  it("omits distance when the viewer has no location", async () => {
    const post = await createPost(creator, { description: "lifecycle-test near" });
    createdPosts.push(post.id);

    const feed = await callFeed();
    const row = feed.find((entry) => entry.id === post.id);
    assert.ok(row, "active post should appear in the feed");
    assert.equal(row.distance_meters, null);
  });

  it("computes distance and ranks a closer post above a farther one", async () => {
    const near = await createPost(creator, {
      description: "lifecycle-test near",
      location: "SRID=4326;POINT(-75.1932 39.9522)",
    });
    const far = await createPost(creator, {
      description: "lifecycle-test far",
      // ~5 km west, same age, so distance is the only differentiator.
      location: "SRID=4326;POINT(-75.2520 39.9522)",
    });
    createdPosts.push(near.id, far.id);

    const feed = await callFeed(39.9522, -75.1932);
    const nearRow = feed.find((row) => row.id === near.id);
    const farRow = feed.find((row) => row.id === far.id);

    assert.ok(nearRow.distance_meters < 50, "near post should be metres away");
    assert.ok(farRow.distance_meters > 3000, "far post should be kilometres away");
    assert.ok(
      nearRow.score > farRow.score,
      "a closer post of the same age should outrank a farther one",
    );
  });
});

/**
 * These run as a real signed-in user rather than with the secret key, because
 * the guard in 0007 exempts admin calls (auth.uid() is null). That also makes
 * them the first tests here that genuinely exercise RLS.
 */
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function sessionFor(email) {
  // Mint an OTP without sending mail, then exchange it for an access token.
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

function asUser(token) {
  return {
    apikey: publishable,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe("availability changes are event-driven only (0007 guard)", () => {
  let creatorId;
  let creatorEmail;
  let strangerId;
  let strangerEmail;
  let strangerToken;
  let post;

  before(async () => {
    creatorEmail = `lifecycle-test-guard-owner-${Date.now()}@upenn.edu`;
    strangerEmail = `lifecycle-test-guard-other-${Date.now()}@upenn.edu`;

    for (const [email, ref] of [[creatorEmail, "creator"], [strangerEmail, "stranger"]]) {
      const response = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, email_confirm: true }),
      });
      const body = await response.json();
      if (ref === "creator") creatorId = body.id;
      else strangerId = body.id;
    }

    strangerToken = await sessionFor(strangerEmail);
    post = await createPost(creatorId, { description: "lifecycle-test guard" });
  });

  after(async () => {
    if (post) await rest(`posts?id=eq.${post.id}`, { method: "DELETE" }).catch(() => {});
    for (const id of [creatorId, strangerId]) if (id) await deleteUser(id);
  });

  it("refuses a direct status write, so one user cannot close a post alone", async () => {
    const response = await fetch(`${url}/rest/v1/posts?id=eq.${post.id}`, {
      method: "PATCH",
      headers: asUser(strangerToken),
      body: JSON.stringify({ status: "closed", close_reason: "creator" }),
    });
    const body = await response.text();

    assert.notEqual(response.status, 204, "direct status write must be rejected");
    assert.match(body, /must go through availability_events/);

    const unchanged = await getPost(post.id);
    assert.equal(unchanged.status, "active");
  });

  it("refuses a direct servings write, keeping the per-user log complete", async () => {
    const response = await fetch(`${url}/rest/v1/posts?id=eq.${post.id}`, {
      method: "PATCH",
      headers: asUser(strangerToken),
      body: JSON.stringify({ servings_remaining: 0 }),
    });
    assert.notEqual(response.status, 204);

    const unchanged = await getPost(post.id);
    assert.equal(unchanged.servings_remaining, 4);
  });

  it("refuses a creator_close from someone who is not the creator", async () => {
    const response = await fetch(`${url}/rest/v1/availability_events`, {
      method: "POST",
      headers: asUser(strangerToken),
      body: JSON.stringify({
        post_id: post.id,
        user_id: strangerId,
        type: "creator_close",
      }),
    });
    const body = await response.text();

    assert.notEqual(response.status, 201);
    assert.match(body, /Only the post creator/);
    const unchanged = await getPost(post.id);
    assert.equal(unchanged.status, "active");
  });

  it("still allows a normal gone report through the event path", async () => {
    const response = await fetch(`${url}/rest/v1/availability_events`, {
      method: "POST",
      headers: asUser(strangerToken),
      body: JSON.stringify({
        post_id: post.id,
        user_id: strangerId,
        type: "gone_report",
      }),
    });
    assert.equal(response.status, 201, await response.text());

    const updated = await getPost(post.id);
    assert.equal(updated.status, "active", "one report still should not close it");
  });

  it("lets the creator close their own post via an event", async () => {
    const creatorToken = await sessionFor(creatorEmail);
    const response = await fetch(`${url}/rest/v1/availability_events`, {
      method: "POST",
      headers: asUser(creatorToken),
      body: JSON.stringify({
        post_id: post.id,
        user_id: creatorId,
        type: "creator_close",
      }),
    });
    assert.equal(response.status, 201, await response.text());

    const closed = await getPost(post.id);
    assert.equal(closed.status, "closed");
    assert.equal(closed.close_reason, "creator");
  });
});
