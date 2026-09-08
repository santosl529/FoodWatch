import { notFound, redirect } from "next/navigation";
import { Clock, MapPin, UtensilsCrossed } from "lucide-react";

import { AvailabilityControls } from "@/components/availability-controls";
import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { embeddedDisplayName, photoUrl, timeAgo } from "@/lib/posts/feed";
import { TAG_LABELS, type Tag } from "@/lib/posts/tags";
import { createClient } from "@/lib/supabase/server";

import { Comments } from "./comments";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signin");
  }

  // Unlike the feed, detail shows closed posts too — a link shared in a group
  // chat should explain that the food is gone rather than 404.
  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, creator_id, description, photo_path, servings_remaining, status, close_reason, location_label, dietary_tags, created_at, bumped_at, profiles:creator_id(display_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!post) {
    notFound();
  }

  const { data: commentRows } = await supabase
    .from("comments")
    .select("id, body, created_at, author_id, profiles:author_id(display_name)")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  const comments = (commentRows ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author_id: row.author_id,
    author_name: embeddedDisplayName(row.profiles),
  }));

  const creatorName = embeddedDisplayName(post.profiles) ?? "Someone";
  const tags = (post.dietary_tags ?? []) as Tag[];
  const isClosed = post.status === "closed";

  const closedExplanation: Record<string, string> = {
    creator: "The poster marked this as gone.",
    zero_servings: "Someone marked the last serving as taken.",
    crowd_reports: "Several people reported this as gone.",
    expired: "This post went quiet and expired.",
  };

  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- see 5b notes */}
        <img
          src={photoUrl(post.photo_path)}
          alt={post.description}
          className="bg-muted max-h-96 w-full rounded-lg object-cover"
        />

        {isClosed ? (
          <div className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
            <span className="text-foreground font-medium">This food is gone.</span>{" "}
            {closedExplanation[post.close_reason ?? ""] ?? ""}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {post.description}
          </h1>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <UtensilsCrossed className="size-4" />
              {post.servings_remaining} serving
              {post.servings_remaining === 1 ? "" : "s"} left
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              {post.location_label}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" />
              {timeAgo(post.bumped_at ?? post.created_at)}
            </span>
          </div>

          <p className="text-muted-foreground text-sm">Posted by {creatorName}</p>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tag.startsWith("contains-") ? "outline" : "secondary"}
                >
                  {TAG_LABELS[tag] ?? tag}
                </Badge>
              ))}
              <p className="text-muted-foreground w-full text-xs">
                Tags are a courtesy from the poster, not a guarantee — ask
                directly if you have a serious allergy.
              </p>
            </div>
          ) : null}
        </div>

        <AvailabilityControls
          postId={post.id}
          servingsRemaining={post.servings_remaining}
          isCreator={post.creator_id === user.id}
          isClosed={isClosed}
        />

        <Comments postId={post.id} initialComments={comments} />
      </main>
    </>
  );
}
