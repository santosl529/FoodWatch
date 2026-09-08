"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AvailabilityState } from "@/lib/posts/availability-state";
import { createClient } from "@/lib/supabase/server";

/**
 * Every availability change is an inserted `availability_events` row; the
 * triggers from 0006/0007 apply the consequences. These actions deliberately
 * never write to `posts` directly — 0007's guard rejects that anyway, which is
 * what keeps a single griefer from closing posts past the two-report threshold.
 */

const postIdSchema = z.uuid("That post id doesn't look right.");

async function insertEvent(
  postId: string,
  type: "gone_report" | "servings_update" | "bump" | "creator_close",
  servingsValue: number | null = null,
): Promise<AvailabilityState> {
  const parsedId = postIdSchema.safeParse(postId);
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? "Invalid post." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be signed in to do that." };
  }

  const { error } = await supabase.from("availability_events").insert({
    post_id: parsedId.data,
    user_id: user.id,
    type,
    servings_value: servingsValue,
  });

  if (error) {
    // The partial unique index from 0002 rejects a second gone_report from the
    // same user, which is a rule working rather than a failure.
    if (error.code === "23505" && type === "gone_report") {
      return { error: "You've already reported this one as gone." };
    }
    return { error: error.message };
  }

  revalidatePath(`/post/${parsedId.data}`);
  revalidatePath("/");
  return { error: null };
}

export async function reportGone(postId: string): Promise<AvailabilityState> {
  return insertEvent(postId, "gone_report");
}

export async function setServings(
  postId: string,
  servings: number,
): Promise<AvailabilityState> {
  const parsed = z.coerce
    .number()
    .int()
    .min(0)
    .max(999)
    .safeParse(servings);

  if (!parsed.success) {
    return { error: "That serving count doesn't look right." };
  }
  return insertEvent(postId, "servings_update", parsed.data);
}

export async function bumpPost(postId: string): Promise<AvailabilityState> {
  return insertEvent(postId, "bump");
}

export async function closePost(postId: string): Promise<AvailabilityState> {
  return insertEvent(postId, "creator_close");
}
