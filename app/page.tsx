import Link from "next/link";
import { redirect } from "next/navigation";

import { FeedList } from "@/app/feed-list";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import type { FeedPost } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection (3c) is deferred, so the feed guards itself. RLS would
  // return nothing to a signed-out visitor anyway; redirecting is clearer than
  // showing a permanently empty feed.
  if (!user) {
    redirect("/signin");
  }

  // No coordinates server-side — the client re-fetches with them once granted.
  const { data, error } = await supabase.rpc("feed_posts", {
    user_lat: null,
    user_lng: null,
  });

  const posts = (data ?? []) as FeedPost[];

  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Free food right now
          </h1>
          <Button asChild size="sm" className="sm:hidden">
            <Link href="/post/new">Post food</Link>
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            Couldn&apos;t load the feed: {error.message}
          </p>
        ) : (
          <FeedList initialPosts={posts} />
        )}
      </main>
    </>
  );
}
