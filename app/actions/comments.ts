"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { CommentState } from "@/lib/posts/comment-state";
import { createClient } from "@/lib/supabase/server";

const commentSchema = z.object({
  postId: z.uuid("That post id doesn't look right."),
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(1000, "Keep comments under 1000 characters."),
});

/**
 * Posting a comment also counts as activity on the post — but that is the
 * `comment_touches_post` trigger's job (0006), not this action's. Doing it here
 * too would race with the trigger and duplicate the rule in two places.
 */
export async function addComment(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const parsed = commentSchema.safeParse({
    postId: String(formData.get("postId") ?? ""),
    body: String(formData.get("body") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Couldn't post that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be signed in to comment." };
  }

  const { error } = await supabase.from("comments").insert({
    post_id: parsed.data.postId,
    author_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    return { error: `Couldn't post that comment: ${error.message}` };
  }

  revalidatePath(`/post/${parsed.data.postId}`);
  return { error: null };
}
