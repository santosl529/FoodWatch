"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, UtensilsCrossed } from "lucide-react";

import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { FeedPost } from "@/lib/posts/feed";

/**
 * The server renders a recency-ranked feed immediately so there is no blank
 * screen and no permission prompt blocking first paint. Once the browser hands
 * over coordinates, we re-fetch the same RPC with them and distance joins the
 * ranking (PRD §6.3). If permission is refused, the initial ordering simply
 * stands — which is exactly the documented fallback.
 */
export function FeedList({ initialPosts }: { initialPosts: FeedPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [lastServerPosts, setLastServerPosts] = useState(initialPosts);
  const askedForLocation = useRef(false);

  // Adjust state during render rather than in an effect — this is React's
  // documented way to resync when a prop changes (a fresh server render after
  // posting, say) without an extra commit.
  if (lastServerPosts !== initialPosts) {
    setLastServerPosts(initialPosts);
    setPosts(initialPosts);
  }

  useEffect(() => {
    // A ref, not state: asking once is a side-effect guard, and putting it in
    // state would re-render for nothing.
    if (!navigator.geolocation || askedForLocation.current) return;
    askedForLocation.current = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("feed_posts", {
          user_lat: position.coords.latitude,
          user_lng: position.coords.longitude,
        });
        if (!error && data) setPosts(data as FeedPost[]);
      },
      () => {
        // Declined or unavailable — keep the recency-only ordering.
      },
      { timeout: 10_000 },
    );
  }, []);

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center">
        <UtensilsCrossed className="text-muted-foreground size-8" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">No free food right now</p>
          <p className="text-muted-foreground text-sm">
            Spotted leftovers somewhere on campus? Be the first to post them.
          </p>
        </div>
        <Button asChild>
          <Link href="/post/new">
            <MapPin className="size-4" />
            Post food
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
