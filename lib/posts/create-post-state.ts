/**
 * State for the create-post form, shaped for `useActionState`.
 *
 * Lives outside `app/actions/posts.ts` because a `"use server"` module may only
 * export async functions.
 */
export type CreatePostState = {
  error: string | null;
};

export const initialCreatePostState: CreatePostState = { error: null };
