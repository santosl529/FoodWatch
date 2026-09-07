import type { Tag } from "@/lib/posts/tags";

/** One row from the `feed_posts` RPC (see 0006_lifecycle.sql). */
export type FeedPost = {
  id: string;
  creator_id: string;
  creator_name: string | null;
  description: string;
  photo_path: string;
  servings_remaining: number;
  location_label: string;
  dietary_tags: Tag[];
  latitude: number;
  longitude: number;
  distance_meters: number | null;
  comment_count: number;
  created_at: string;
  bumped_at: string | null;
  last_activity_at: string;
  score: number;
};

/**
 * Public URL for a post photo. The `post-photos` bucket is public (see
 * 0005_storage.sql), so this needs no signing.
 */
export function photoUrl(photoPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/post-photos/${photoPath}`;
}

/** Compact relative time: "just now", "12m", "3h". */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "120 m away" / "1.4 km away", or null when the viewer shared no location. */
export function distanceLabel(meters: number | null): string | null {
  if (meters == null) return null;
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}
