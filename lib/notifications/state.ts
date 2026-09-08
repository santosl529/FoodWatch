import type { Tag } from "@/lib/posts/tags";

/** Lives outside the `"use server"` module, which may only export functions. */
export type NotificationSettingsState = {
  error: string | null;
  saved: boolean;
};

export const initialNotificationSettingsState: NotificationSettingsState = {
  error: null,
  saved: false,
};

export type AppNotification = {
  id: string;
  post_id: string | null;
  type: "nearby_post" | "comment" | "system";
  body: string;
  read: boolean;
  created_at: string;
};

/** The `dietary_filter` jsonb shape defined in 0008_notifications.sql. */
export type DietaryFilter = {
  require?: Tag[];
  exclude?: Tag[];
};

export type NotificationPreferences = {
  radius_meters: number | null;
  latitude: number | null;
  longitude: number | null;
  building_labels: string[];
  dietary_filter: DietaryFilter;
  notify_on_comment: boolean;
};
