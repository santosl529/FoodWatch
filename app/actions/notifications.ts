"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { NotificationSettingsState } from "@/lib/notifications/state";
import { tagSchema } from "@/lib/posts/tags";
import { createClient } from "@/lib/supabase/server";

/**
 * Preferences are written by the user for the user — `notification_preferences`
 * has own-row RLS, so `user_id` is taken from the session and never from the
 * form. Who gets notified is decided by the triggers in 0008 reading these
 * rows; nothing here can target anyone else.
 */
const settingsSchema = z.object({
  radiusMeters: z
    .union([z.coerce.number().int().min(50).max(5000), z.literal("")])
    .optional(),
  latitude: z.union([z.coerce.number().min(-90).max(90), z.literal("")]).optional(),
  longitude: z
    .union([z.coerce.number().min(-180).max(180), z.literal("")])
    .optional(),
  buildingLabels: z.string().max(500).optional(),
  require: z.array(tagSchema).max(12),
  exclude: z.array(tagSchema).max(12),
  notifyOnComment: z.boolean(),
});

export async function saveNotificationSettings(
  _prev: NotificationSettingsState,
  formData: FormData,
): Promise<NotificationSettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be signed in.", saved: false };
  }

  const parsed = settingsSchema.safeParse({
    radiusMeters: String(formData.get("radiusMeters") ?? ""),
    latitude: String(formData.get("latitude") ?? ""),
    longitude: String(formData.get("longitude") ?? ""),
    buildingLabels: String(formData.get("buildingLabels") ?? ""),
    require: formData.getAll("require"),
    exclude: formData.getAll("exclude"),
    notifyOnComment: formData.get("notifyOnComment") === "on",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and retry.",
      saved: false,
    };
  }

  const { radiusMeters, latitude, longitude } = parsed.data;
  const hasCenter = latitude !== "" && longitude !== "" && latitude != null && longitude != null;

  const buildingLabels = (parsed.data.buildingLabels ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 20);

  // Only store the halves of the filter that are actually set, so `{}` keeps
  // its documented "matches everything" meaning.
  const dietaryFilter: Record<string, string[]> = {};
  if (parsed.data.require.length > 0) dietaryFilter.require = parsed.data.require;
  if (parsed.data.exclude.length > 0) dietaryFilter.exclude = parsed.data.exclude;

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      radius_meters:
        radiusMeters === "" || radiusMeters == null ? null : radiusMeters,
      center: hasCenter ? `SRID=4326;POINT(${longitude} ${latitude})` : null,
      building_labels: buildingLabels,
      dietary_filter: dietaryFilter,
      notify_on_comment: parsed.data.notifyOnComment,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: `Couldn't save: ${error.message}`, saved: false };
  }

  revalidatePath("/settings/notifications");
  return { error: null, saved: true };
}

export async function markNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS restricts this to the caller's own rows; the filter is belt and braces.
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  revalidatePath("/");
}
