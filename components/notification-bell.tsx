"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Settings } from "lucide-react";

import { markNotificationsRead } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/notifications/state";
import { timeAgo } from "@/lib/posts/feed";

export function NotificationBell({
  userId,
  initialNotifications,
}: {
  userId: string;
  initialNotifications: AppNotification[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [lastServer, setLastServer] = useState(initialNotifications);
  const [, startTransition] = useTransition();
  const router = useRouter();

  if (lastServer !== initialNotifications) {
    setLastServer(initialNotifications);
    setNotifications(initialNotifications);
  }

  const unread = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          // RLS already restricts these rows to the current user; the filter
          // avoids waking every client for every insert.
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((current) => [
            payload.new as AppNotification,
            ...current,
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  function handleOpenChange(open: boolean) {
    if (!open || unread === 0) return;
    // Mark read on open — the badge is about "anything new since you looked",
    // and per-item read tracking is more bookkeeping than this earns.
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    startTransition(async () => {
      await markNotificationsRead();
      router.refresh();
    });
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        {notifications.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            Nothing yet. Set a radius or a building to hear about food nearby.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {notifications.slice(0, 20).map((item) => {
              const content = (
                <div className="flex flex-col gap-0.5 px-2 py-1.5">
                  <p className="text-sm leading-snug">{item.body}</p>
                  <span className="text-muted-foreground text-xs">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
              );
              return (
                <li key={item.id} className="hover:bg-accent rounded-sm">
                  {item.post_id ? (
                    <Link href={`/post/${item.post_id}`}>{content}</Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DropdownMenuSeparator />

        <Link
          href="/settings/notifications"
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-2 py-1.5 text-xs"
        >
          <Settings className="size-3.5" />
          Notification settings
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
