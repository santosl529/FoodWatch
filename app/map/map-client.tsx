"use client";

import dynamic from "next/dynamic";

import type { FeedPost } from "@/lib/posts/feed";

/**
 * `maplibre-gl` is a browser-only library — it reaches for `window` and WebGL
 * at module scope, so it must not be part of the server render or the initial
 * hydration payload. `ssr: false` keeps it in a client-only chunk.
 *
 * The loading state is deliberately visible rather than a blank div: a map that
 * fails to appear should say something, and "Loading map…" that never resolves
 * is itself a useful signal that the chunk didn't load.
 */
const MapView = dynamic(
  () => import("./map-view").then((module) => module.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-[calc(100dvh_-_3.5rem)] items-center justify-center text-sm">
        Loading map…
      </div>
    ),
  },
);

export function MapClient({
  posts,
  radiusMeters,
}: {
  posts: FeedPost[];
  radiusMeters: number | null;
}) {
  return <MapView posts={posts} radiusMeters={radiusMeters} />;
}
