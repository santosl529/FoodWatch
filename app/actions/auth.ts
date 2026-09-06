"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { PENN_EMAIL_PATTERN } from "@/lib/auth/penn-email";
import type { SignInState } from "@/lib/auth/sign-in-state";
import { createClient } from "@/lib/supabase/server";

// NOTE: this module is "use server" — it may only export async functions.
// `SignInState` and `initialSignInState` therefore live in
// `lib/auth/sign-in-state.ts`; a value export here is a runtime error.

const emailField = z
  .string()
  .trim()
  .max(254, "That email address is too long.")
  .regex(PENN_EMAIL_PATTERN, "Use your Penn email address (@upenn.edu).");

const sendOtpSchema = z.object({ email: emailField });

const verifyOtpSchema = z.object({
  email: emailField,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Something looks wrong with that input.";
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/**
 * Step 1 — send a 6-digit code to a Penn address.
 *
 * The Zod check here is a UX nicety, exactly like the client-side one. The
 * actual domain gate is the Before User Created hook in Supabase (PRD §4, §8),
 * which rejects non-Penn addresses even for a request that never touches this
 * action.
 */
export async function sendOtp(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = sendOtpSchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) {
    return { error: firstIssue(parsed.error), sentTo: null };
  }

  const email = parsed.data.email.toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { error: error.message, sentTo: null };
  }

  return { error: null, sentTo: email };
}

/**
 * Step 2 — exchange the emailed code for a session.
 *
 * On success this redirects; `redirect()` throws internally, so nothing after
 * it runs and the function never actually returns a state in the happy path.
 */
export async function verifyOtp(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = field(formData, "email");
  const parsed = verifyOtpSchema.safeParse({
    email,
    token: field(formData, "token"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error), sentTo: email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email.toLowerCase(),
    token: parsed.data.token,
    type: "email",
  });

  if (error) {
    // Supabase returns "Token has expired or is invalid" for both a wrong code
    // and an expired one. Say so in plainer language, and keep the user on the
    // code step so they can retry or request another.
    const message = /expired|invalid/i.test(error.message)
      ? "That code is incorrect or has expired. Check the latest email, or request a new code."
      : error.message;
    return { error: message, sentTo: parsed.data.email.toLowerCase() };
  }

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signin");
}
