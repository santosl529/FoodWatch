/**
 * Shared state for the two sign-in steps, shaped for `useActionState`.
 *
 * This lives outside `app/actions/auth.ts` because a `"use server"` module may
 * only export async functions — exporting the initial-state object from there
 * is a runtime error in Next.js.
 *
 * `sentTo` doubles as the step indicator: once a code has been sent, the form
 * switches from the email field to the code field.
 */
export type SignInState = {
  error: string | null;
  sentTo: string | null;
};

export const initialSignInState: SignInState = { error: null, sentTo: null };
