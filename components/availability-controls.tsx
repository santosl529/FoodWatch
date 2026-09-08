"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpFromLine, CircleSlash, Hand, Loader2 } from "lucide-react";

import {
  bumpPost,
  closePost,
  reportGone,
  setServings,
} from "@/app/actions/availability";
import { Button } from "@/components/ui/button";

/**
 * Crowd-sourced availability controls (PRD §6.1/§6.2).
 *
 * Every button inserts an availability event; the database decides what that
 * means — closing at zero servings, closing once two distinct people report it
 * gone. Nothing here decides a post's status, which is why two people tapping
 * "it's gone" at the same moment can't race each other.
 */
export function AvailabilityControls({
  postId,
  servingsRemaining,
  isCreator,
  isClosed,
}: {
  postId: string;
  servingsRemaining: number;
  isCreator: boolean;
  isClosed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (isClosed) {
    return isCreator ? (
      <p className="text-muted-foreground text-sm">
        This post is closed. Post again if there&apos;s more food.
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || servingsRemaining <= 0}
          onClick={() =>
            run(() => setServings(postId, Math.max(servingsRemaining - 1, 0)))
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Hand className="size-4" />
          )}
          I took one
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => reportGone(postId))}
        >
          <CircleSlash className="size-4" />
          It&apos;s gone
        </Button>

        {isCreator ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => bumpPost(postId))}
            >
              <ArrowUpFromLine className="size-4" />
              Still here — bump
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => closePost(postId))}
            >
              Close post
            </Button>
          </>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        Reporting it gone helps everyone — a post closes once two people say so.
      </p>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
