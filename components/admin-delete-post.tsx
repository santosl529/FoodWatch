"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deletePostAsAdmin } from "@/app/actions/moderation";
import { Button } from "@/components/ui/button";

/**
 * Shown only to admins. The button's visibility is cosmetic — the actual
 * permission is the `posts_delete_admin` RLS policy, so rendering this for the
 * wrong person would achieve nothing beyond a confusing no-op.
 */
export function AdminDeletePost({ postId }: { postId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
        Remove post
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Delete this post permanently?</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deletePostAsAdmin(postId);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Delete
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
