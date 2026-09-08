"use client";

import dynamic from "next/dynamic";

import type { NotificationPreferences } from "@/lib/notifications/state";

/**
 * The form embeds a LocationPicker, which pulls in maplibre-gl — browser-only.
 * `ssr: false` is rejected inside a Server Component, so the dynamic import has
 * to live in a client module like this one.
 */
const NotificationSettingsForm = dynamic(
  () =>
    import("./settings-form").then((module) => module.NotificationSettingsForm),
  {
    ssr: false,
    loading: () => (
      <p className="text-muted-foreground text-sm">Loading preferences…</p>
    ),
  },
);

export function NotificationSettingsClient({
  preferences,
}: {
  preferences: NotificationPreferences | null;
}) {
  return <NotificationSettingsForm preferences={preferences} />;
}
