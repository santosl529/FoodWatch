import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import type { FeedPost } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

import { MapClient } from "./map-client";

export const metadata: Metadata = {
  title: "Map · Penn Free Food",
};

export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  // Same RPC as the feed, so "active" means exactly what it means there —
  // including the lazy MAX_AGE expiry. PRD §5.5 wants active posts only.
  const { data } = await supabase.rpc("feed_posts", {
    user_lat: null,
    user_lng: null,
  });

  return (
    <>
      <Nav />
      <MapClient posts={(data ?? []) as FeedPost[]} />
    </>
  );
}
