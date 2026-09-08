import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import type { FeedPost } from "@/lib/posts/feed";
import { parseEwkbPoint } from "@/lib/geo/ewkb";
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

  // The notification radius is drawn where the user actually set it — the
  // centre saved in settings, not wherever they happen to be standing. That is
  // what decides which posts notify them.
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("radius_meters, center")
    .eq("user_id", user.id)
    .maybeSingle();

  const center = parseEwkbPoint(prefs?.center as string | null);
  const notifyArea =
    center && prefs?.radius_meters
      ? {
          latitude: center.latitude,
          longitude: center.longitude,
          radiusMeters: prefs.radius_meters,
        }
      : null;

  return (
    <>
      <Nav />
      <MapClient posts={(data ?? []) as FeedPost[]} notifyArea={notifyArea} />
    </>
  );
}
