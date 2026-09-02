import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import { SignInCard } from "./signin-form";

export const metadata: Metadata = {
  title: "Sign in · Penn Free Food",
};

export default async function SignInPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in — no reason to show the form. Route protection for the
  // rest of the app lands in 3c.
  if (user) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <UtensilsCrossed className="size-8" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Penn Free Food
        </h1>
        <p className="text-muted-foreground max-w-xs text-sm">
          Find leftover free food on campus before it&apos;s thrown out.
        </p>
      </div>

      <SignInCard />
    </main>
  );
}
