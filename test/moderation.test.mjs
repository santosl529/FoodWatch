/**
 * Moderation and anti-abuse tests (PRD §12 step 9) — see 0009_moderation.sql.
 *
 * Deletion and rate limiting are authorization rules, so these run as real
 * signed-in users. Using the secret key would bypass exactly what is under test.
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

/** Far from both Penn and the notification suite's origin. */
const ORIGIN = { lat: 29.7604, lng: -95.3698 };

describe("moderation and anti-abuse", () => {
  const users = [];
  const posts = [];

  async function newUser(label) {
    const user = await createUser(`mod-${label}`);
    users.push(user.id);
    return user;
  }

  async function newPost(creatorId, overrides) {
    const post = await createPost(creatorId, {
      location: `SRID=4326;POINT(${ORIGIN.lng} ${ORIGIN.lat})`,
      description: "lifecycle-test moderation",
      ...overrides,
    });
    posts.push(post.id);
    return post;
  }

  async function makeAdmin(userId) {
    await rest(`profiles?id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" }),
    });
  }

  after(async () => {
    for (const id of posts) {
      await rest(`posts?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    for (const id of users) await deleteUser(id);
  });

  it("lets an admin delete someone else's post", async () => {
    const author = await newUser("author");
    const admin = await newUser("admin");
    await makeAdmin(admin.id);

    const post = await newPost(author.id);
    const token = await sessionFor(admin.email);

    const response = await fetch(`${url}/rest/v1/posts?id=eq.${post.id}`, {
      method: "DELETE",
      headers: asUser(token),
    });
    assert.equal(response.status, 204, await response.text());

    const remaining = await rest(`posts?id=eq.${post.id}&select=id`);
    assert.equal(remaining.length, 0, "admin delete should remove the post");
  });

  it("does not let an ordinary student delete someone else's post", async () => {
    const author = await newUser("author2");
    const stranger = await newUser("stranger");

    const post = await newPost(author.id);
    const token = await sessionFor(stranger.email);

    await fetch(`${url}/rest/v1/posts?id=eq.${post.id}`, {
      method: "DELETE",
      headers: asUser(token),
    });

    const remaining = await rest(`posts?id=eq.${post.id}&select=id`);
    assert.equal(
      remaining.length,
      1,
      "a non-admin must not be able to delete another user's post",
    );
  });

  it("still lets an author delete their own post", async () => {
    const author = await newUser("selfdelete");
    const post = await newPost(author.id);
    const token = await sessionFor(author.email);

    const response = await fetch(`${url}/rest/v1/posts?id=eq.${post.id}`, {
      method: "DELETE",
      headers: asUser(token),
    });
    assert.equal(response.status, 204, await response.text());
  });

  it("lets an admin delete someone else's comment", async () => {
    const author = await newUser("cauthor");
    const admin = await newUser("cadmin");
    await makeAdmin(admin.id);

    const post = await newPost(author.id);
    const [comment] = await rest("comments?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        post_id: post.id,
        author_id: author.id,
        body: "lifecycle-test comment",
      }),
    });

    const token = await sessionFor(admin.email);
    const response = await fetch(`${url}/rest/v1/comments?id=eq.${comment.id}`, {
      method: "DELETE",
      headers: asUser(token),
    });
    assert.equal(response.status, 204, await response.text());
  });

  it("rate-limits a user filing gone reports across many posts", async () => {
    const author = await newUser("spamtarget");
    const griefer = await newUser("griefer");
    const token = await sessionFor(griefer.email);

    // The limit is 12/hour. Post more than that so the cap, not the supply of
    // posts, is what stops them.
    const targets = [];
    for (let index = 0; index < 14; index += 1) {
      targets.push(await newPost(author.id, { description: `lifecycle-test spam ${index}` }));
    }

    let accepted = 0;
    let rejection = null;
    for (const target of targets) {
      const response = await fetch(`${url}/rest/v1/availability_events`, {
        method: "POST",
        headers: asUser(token),
        body: JSON.stringify({
          post_id: target.id,
          user_id: griefer.id,
          type: "gone_report",
        }),
      });
      if (response.status === 201) accepted += 1;
      else if (!rejection) rejection = await response.text();
    }

    assert.equal(accepted, 12, "should accept exactly the hourly limit");
    assert.match(rejection ?? "", /Too many gone reports/);
  });
});
