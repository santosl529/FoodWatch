import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";

import { CreatePostForm } from "./post-form";

export const metadata: Metadata = {
  title: "Post food · Penn Free Food",
};

export default async function NewPostPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection (3c) is deferred, so this page guards itself. Posting
  // requires a session anyway — RLS rejects an insert without one.
  if (!user) {
    redirect("/signin");
  }

  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Post food</h1>
          <p className="text-muted-foreground text-sm">
            Snap a photo, say where it is, and let people know before it&apos;s
            thrown out.
          </p>
        </div>

        <CreatePostForm userId={user.id} />
      </main>
    </>
  );
}
