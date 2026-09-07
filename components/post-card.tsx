import Link from "next/link";
import { MapPin, MessageCircle, UtensilsCrossed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  distanceLabel,
  photoUrl,
  timeAgo,
  type FeedPost,
} from "@/lib/posts/feed";
import { TAG_LABELS } from "@/lib/posts/tags";

export function PostCard({ post }: { post: FeedPost }) {
  const distance = distanceLabel(post.distance_meters);
  // Allergen warnings are the tags people scan for, so surface those first.
  const tags = [...post.dietary_tags].sort((a, b) => {
    const aWarn = a.startsWith("contains-") ? 0 : 1;
    const bWarn = b.startsWith("contains-") ? 0 : 1;
    return aWarn - bWarn;
  });

  return (
    <Card className="overflow-hidden p-0">
      <Link href={`/post/${post.id}`} className="flex gap-4 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image
            would need the Supabase host added to next.config.ts; see notes. */}
        <img
          src={photoUrl(post.photo_path)}
          alt=""
          className="bg-muted size-24 shrink-0 rounded-md object-cover"
          loading="lazy"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium">
              {post.description}
            </p>
            <span className="text-muted-foreground shrink-0 text-xs">
              {timeAgo(post.bumped_at ?? post.created_at)}
            </span>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <UtensilsCrossed className="size-3" />
              {post.servings_remaining} left
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {post.location_label}
              {distance ? ` · ${distance}` : ""}
            </span>
            {post.comment_count > 0 ? (
              <span className="flex items-center gap-1">
                <MessageCircle className="size-3" />
                {post.comment_count}
              </span>
            ) : null}
          </div>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tag.startsWith("contains-") ? "outline" : "secondary"}
                  className="text-[10px]"
                >
                  {TAG_LABELS[tag] ?? tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
