"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Admin moderation deletes.
 *
 * These run as the signed-in user, not through the secret-key admin client: the
 * `posts_delete_admin` / `comments_delete_admin` policies from 0009 are what
 * grant the permission. If a non-admin calls this, RLS matches no rows and
 * nothing is deleted — the check is in the database, not in this function.
 * There is deliberately no code path here that could delete something the
 * caller's own session isn't allowed to.
 */
const idSchema = z.uuid();

export async function deletePostAsAdmin(postId: string): Promise<void> {
  const parsed = idSchema.safeParse(postId);
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from("posts").delete().eq("id", parsed.data);

  revalidatePath("/");
  redirect("/");
}

export async function deleteCommentAsAdmin(
  commentId: string,
  postId: string,
): Promise<void> {
  const parsedComment = idSchema.safeParse(commentId);
  const parsedPost = idSchema.safeParse(postId);
  if (!parsedComment.success || !parsedPost.success) return;

  const supabase = await createClient();
  await supabase.from("comments").delete().eq("id", parsedComment.data);

  revalidatePath(`/post/${parsedPost.data}`);
}
