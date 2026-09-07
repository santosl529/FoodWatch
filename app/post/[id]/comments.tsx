"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";

import { addComment } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  initialCommentState,
  type PostComment,
} from "@/lib/posts/comment-state";
import { embeddedDisplayName, timeAgo } from "@/lib/posts/feed";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="icon" disabled={pending} aria-label="Post comment">
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
    </Button>
  );
}

export function Comments({
  postId,
  initialComments,
}: {
  postId: string;
  initialComments: PostComment[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [lastServerComments, setLastServerComments] = useState(initialComments);
  const [state, formAction] = useActionState(addComment, initialCommentState);
  const formRef = useRef<HTMLFormElement>(null);

  if (lastServerComments !== initialComments) {
    setLastServerComments(initialComments);
    setComments(initialComments);
  }

  useEffect(() => {
    const supabase = createClient();

    /**
     * The realtime payload carries only the raw `comments` row, with no joined
     * author name, so refetch the thread rather than rendering a nameless
     * comment. At a few comments per post this is cheaper than the complexity
     * of patching a single row and looking up its author separately.
     */
    async function refetch() {
      const { data } = await supabase
        .from("comments")
        .select("id, body, created_at, author_id, profiles:author_id(display_name)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (!data) return;
      setComments(
        data.map((row) => ({
          id: row.id,
          body: row.body,
          created_at: row.created_at,
          author_id: row.author_id,
          author_name: embeddedDisplayName(row.profiles),
        })),
      );
    }

    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [postId]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">
        {comments.length === 0
          ? "Comments"
          : `Comments (${comments.length})`}
      </h2>

      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No comments yet. Ask if it&apos;s still there, or let people know what
          you found.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">
                  {comment.author_name ?? "Someone"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {timeAgo(comment.created_at)}
                </span>
              </div>
              <p className="text-sm">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={async (formData) => {
          formAction(formData);
          formRef.current?.reset();
        }}
        className="flex items-start gap-2"
      >
        <input type="hidden" name="postId" value={postId} />
        <input
          name="body"
          required
          maxLength={1000}
          placeholder="Is this still there?"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] md:text-sm"
        />
        <SendButton />
      </form>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
