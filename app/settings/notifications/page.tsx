import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import type {
  DietaryFilter,
  NotificationPreferences,
} from "@/lib/notifications/state";
import { createClient } from "@/lib/supabase/server";

import { NotificationSettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Notifications · Penn Free Food",
};

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: row } = await supabase
    .from("notification_preferences")
    .select(
      "radius_meters, building_labels, dietary_filter, notify_on_comment",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const preferences: NotificationPreferences | null = row
    ? {
        radius_meters: row.radius_meters,
        building_labels: row.building_labels ?? [],
        dietary_filter: (row.dietary_filter ?? {}) as DietaryFilter,
        notify_on_comment: row.notify_on_comment,
      }
    : null;

  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="text-muted-foreground text-sm">
            Choose what&apos;s worth interrupting you for.
          </p>
        </div>

        <NotificationSettingsClient preferences={preferences} />
      </main>
    </>
  );
}
