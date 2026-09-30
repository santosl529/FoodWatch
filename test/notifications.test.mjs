/**
 * Notification fan-out tests (PRD §5.6, §6.6) — see 0008_notifications.sql.
 *
 * The security-relevant property here is that a notification's recipient is
 * decided by that recipient's own stored preferences and nothing else. Several
 * of these tests exist to prove a poster cannot reach someone who did not ask
 * to hear from them.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  asUser,
  createPost,
  createUser,
  deleteUser,
  rest,
  sessionFor,
  url,
} from "./helpers.mjs";

/**
 * Deliberately NOT Penn's coordinates.
 *
 * `node --test` runs test files in parallel processes against one shared
 * database, and the lifecycle suite creates posts at Penn. Those posts matched
 * the radius preferences registered here, so notifications leaked across suites
 * and these assertions failed intermittently. Anchoring this suite far from
 * campus makes the two sets of fixtures unable to see each other.
 */
const ORIGIN = { lat: 41.8781, lng: -87.6298 };
/** ~2.8 km west of ORIGIN — outside any campus-sized radius. */
const FAR = { lat: 41.8781, lng: -87.6634 };

async function setPreferences(userId, prefs) {
  await rest("notification_preferences", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, ...prefs }),
  });
}

/**
 * Since 0010, every post notifies every user by default, so a bare count for a
 * user is no longer a statement about one post — fixtures created later in the
 * suite land in the same inbox. Scope assertions by post and/or type.
 */
async function notificationsFor(userId, { postId, type } = {}) {
  const filters = [`user_id=eq.${userId}`];
  if (postId) filters.push(`post_id=eq.${postId}`);
  if (type) filters.push(`type=eq.${type}`);
  return rest(`notifications?${filters.join("&")}&select=*&order=created_at.desc`);
}

describe("notification fan-out", () => {
  const users = [];
  const posts = [];

  async function newUser(label) {
    const user = await createUser(`notif-${label}`);
    users.push(user.id);
    return user;
  }

  async function newPost(creatorId, overrides) {
    const post = await createPost(creatorId, {
      location: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      ...overrides,
    });
    posts.push(post.id);
    return post;
  }

  after(async () => {
    for (const id of posts) {
      await rest(`posts?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    for (const id of users) await deleteUser(id);
  });

  it("notifies a user whose radius covers the post", async () => {
    const poster = await newUser("poster");
    const nearby = await newUser("nearby");
    await setPreferences(nearby.id, {
      center: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      radius_meters: 1000,
    });

    const post = await newPost(poster.id, { description: "lifecycle-test radius hit" });

    const received = await notificationsFor(nearby.id, { postId: post.id });
    assert.equal(received.length, 1);
    assert.equal(received[0].type, "nearby_post");
    assert.equal(received[0].post_id, post.id);
  });

  it("does not notify a user whose radius excludes the post", async () => {
    const poster = await newUser("poster2");
    const far = await newUser("far");
    await setPreferences(far.id, {
      center: `SRID=4326;POINT(${FAR.lng} ${FAR.lat})`,
      radius_meters: 500,
    });

    const post = await newPost(poster.id, { description: "lifecycle-test radius miss" });

    assert.equal((await notificationsFor(far.id, { postId: post.id })).length, 0);
  });

  it("never notifies the poster about their own post", async () => {
    const poster = await newUser("self");
    await setPreferences(poster.id, {
      center: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      radius_meters: 5000,
    });

    const post = await newPost(poster.id, { description: "lifecycle-test own post" });

    assert.equal((await notificationsFor(poster.id, { postId: post.id })).length, 0);
  });

  it("notifies a user who has configured nothing about everything (0010)", async () => {
    const poster = await newUser("poster3");
    const unconfigured = await newUser("unconfigured");
    await setPreferences(unconfigured.id, { notify_on_comment: true });

    const post = await newPost(poster.id, { description: "lifecycle-test unconfigured" });

    assert.equal(
      (await notificationsFor(unconfigured.id, { postId: post.id })).length,
      1,
      "no radius and no buildings now means everything, not silence",
    );
  });

  it("notifies a user with no preferences row at all", async () => {
    const poster = await newUser("poster3b");
    const brandNew = await newUser("nopreferences");

    const post = await newPost(poster.id, { description: "lifecycle-test no prefs row" });

    assert.equal(
      (await notificationsFor(brandNew.id, { postId: post.id })).length,
      1,
      "a student who never opened settings should still hear about food",
    );
  });

  it("honours an exclude dietary filter", async () => {
    const poster = await newUser("poster4");
    const allergic = await newUser("allergic");
    await setPreferences(allergic.id, {
      center: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      radius_meters: 2000,
      dietary_filter: { exclude: ["contains-nuts"] },
    });

    const post = await newPost(poster.id, {
      description: "lifecycle-test peanut brittle",
      dietary_tags: ["snacks", "contains-nuts"],
    });

    assert.equal(
      (await notificationsFor(allergic.id, { postId: post.id })).length,
      0,
      "a post carrying an excluded allergen tag must not notify",
    );
  });

  it("honours a require dietary filter", async () => {
    const poster = await newUser("poster5");
    const vegan = await newUser("vegan");
    await setPreferences(vegan.id, {
      center: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      radius_meters: 2000,
      dietary_filter: { require: ["vegan"] },
    });

    const nonVegan = await newPost(poster.id, {
      description: "lifecycle-test not vegan",
      dietary_tags: ["meal"],
    });
    assert.equal((await notificationsFor(vegan.id, { postId: nonVegan.id })).length, 0);

    const veganPost = await newPost(poster.id, {
      description: "lifecycle-test vegan bowl",
      dietary_tags: ["meal", "vegan"],
    });
    assert.equal((await notificationsFor(vegan.id, { postId: veganPost.id })).length, 1);
  });

  it("matches on a watched building even with no radius set", async () => {
    const poster = await newUser("poster6");
    const watcher = await newUser("watcher");
    await setPreferences(watcher.id, { building_labels: ["towne 100"] });

    const post = await newPost(poster.id, {
      description: "lifecycle-test building match",
      location_label: "Towne 100",
    });

    assert.equal(
      (await notificationsFor(watcher.id, { postId: post.id })).length,
      1,
      "building match should be case-insensitive",
    );
  });

  it("matches a watched building when the label carries room details", async () => {
    const poster = await newUser("poster6b");
    const watcher = await newUser("watcher2");
    await setPreferences(watcher.id, { building_labels: ["levine hall"] });

    // The create form composes "<place> · <details>" (9f).
    const post = await newPost(poster.id, {
      description: "lifecycle-test building match with details",
      location_label: "Levine Hall · room 101",
    });

    assert.equal(
      (await notificationsFor(watcher.id, { postId: post.id })).length,
      1,
      "the room suffix should not stop a building match",
    );
  });

  // 9h: the app saves the viewer's live position as their centre with an
  // upsert of just `user_id` + `center`, as the signed-in user.
  it("saving only a centre keeps an existing radius", async () => {
    const viewer = await newUser("liveviewer");
    await setPreferences(viewer.id, { radius_meters: 800 });
    const token = await sessionFor(viewer.email);

    const response = await fetch(`${url}/rest/v1/notification_preferences`, {
      method: "POST",
      headers: { ...asUser(token), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: viewer.id,
        center: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      }),
    });
    assert.ok(response.ok, await response.text());

    const [row] = await rest(
      `notification_preferences?user_id=eq.${viewer.id}&select=radius_meters,center`,
    );
    assert.equal(row.radius_meters, 800, "the radius must survive a centre save");
    assert.ok(row.center, "the centre should be saved");
  });

  it("does not let a student overwrite someone else's centre", async () => {
    const victim = await newUser("centrevictim");
    const attacker = await newUser("centreattacker");
    await setPreferences(victim.id, {
      center: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      radius_meters: 500,
    });
    const before = await rest(
      `notification_preferences?user_id=eq.${victim.id}&select=center`,
    );
    const token = await sessionFor(attacker.email);

    await fetch(`${url}/rest/v1/notification_preferences`, {
      method: "POST",
      headers: { ...asUser(token), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: victim.id,
        center: `SRID=4326;POINT(${FAR.lng} ${FAR.lat})`,
      }),
    });

    const after = await rest(
      `notification_preferences?user_id=eq.${victim.id}&select=center`,
    );
    assert.deepEqual(after, before, "own-row RLS must reject the write");
  });

  it("notifies the post creator of a comment, but not the commenter", async () => {
    const creator = await newUser("creator");
    const commenter = await newUser("commenter");
    const post = await newPost(creator.id, { description: "lifecycle-test comment target" });

    await rest("comments", {
      method: "POST",
      body: JSON.stringify({
        post_id: post.id,
        author_id: commenter.id,
        body: "still there?",
      }),
    });

    const forCreator = await notificationsFor(creator.id, { type: "comment" });
    assert.equal(forCreator.length, 1);
    assert.equal(forCreator[0].post_id, post.id);
    assert.equal(
      (await notificationsFor(commenter.id, { type: "comment" })).length,
      0,
      "the commenter should get no comment notification of their own",
    );
  });

  it("does not notify the creator about their own comment", async () => {
    const creator = await newUser("selfcomment");
    const post = await newPost(creator.id, { description: "lifecycle-test self comment" });

    await rest("comments", {
      method: "POST",
      body: JSON.stringify({
        post_id: post.id,
        author_id: creator.id,
        body: "bumping my own post",
      }),
    });

    assert.equal((await notificationsFor(creator.id, { type: "comment" })).length, 0);
  });

  it("respects notify_on_comment = false", async () => {
    const creator = await newUser("nocomment");
    const commenter = await newUser("commenter2");
    await setPreferences(creator.id, { notify_on_comment: false });
    const post = await newPost(creator.id, { description: "lifecycle-test muted" });

    await rest("comments", {
      method: "POST",
      body: JSON.stringify({
        post_id: post.id,
        author_id: commenter.id,
        body: "hello?",
      }),
    });

    assert.equal((await notificationsFor(creator.id, { type: "comment" })).length, 0);
  });
});
