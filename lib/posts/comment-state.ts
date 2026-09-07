/**
 * State for the comment form, shaped for `useActionState`. Lives outside the
 * `"use server"` module, which may only export async functions.
 */
export type CommentState = {
  error: string | null;
};

export const initialCommentState: CommentState = { error: null };

export type PostComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
};
