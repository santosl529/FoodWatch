"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { tagSchema } from "@/lib/posts/tags";
import type { CreatePostState } from "@/lib/posts/create-post-state";
import { createClient } from "@/lib/supabase/server";

// NOTE: "use server" modules may only export async functions — the state type
// and its initial value live in `lib/posts/create-post-state.ts`.

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

/** Mirrors the bucket's file_size_limit in 0005_storage.sql. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const createPostSchema = z.object({
  description: z
    .string()
    .trim()
    .min(3, "Say a little about the food.")
    .max(500, "Keep the description under 500 characters."),
  servings: z.coerce
    .number()
    .int("Servings must be a whole number.")
    .min(1, "There has to be at least one serving left.")
    .max(999, "That's more servings than this app can believe."),
  locationLabel: z
    .string()
    .trim()
    .min(2, "Add a building or room so people can find it.")
    .max(120, "Keep the location label short."),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  tags: z.array(tagSchema).max(12),
});

function fail(message: string): CreatePostState {
  return { error: message };
}

/**
 * Creates a post: uploads the required photo to Storage, then inserts the row.
 *
 * Runs as the signed-in user (publishable key + session cookies), so RLS and
 * the storage policies from 0005 apply — a user cannot write a post attributed
 * to someone else, or upload outside their own folder.
 */
export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const parsed = createPostSchema.safeParse({
    description: formData.get("description"),
    servings: formData.get("servings"),
    locationLabel: formData.get("locationLabel"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    tags: formData.getAll("tags"),
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and retry.");
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return fail("A photo is required — it's what makes a post trustworthy.");
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(photo.type)) {
    return fail("Photos must be JPEG, PNG, WebP, or HEIC.");
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return fail("That photo is over 5 MB. Try a smaller one.");
  }

  const extension = photo.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  // The first path segment must be the user id — the storage policies check it.
  const photoPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("post-photos")
    .upload(photoPath, photo, { contentType: photo.type, upsert: false });

  if (uploadError) {
    return fail(`Couldn't upload the photo: ${uploadError.message}`);
  }

  const { data: post, error: insertError } = await supabase
    .from("posts")
    .insert({
      creator_id: user.id,
      description: parsed.data.description,
      photo_path: photoPath,
      servings_remaining: parsed.data.servings,
      // PostGIS accepts EWKT; longitude comes first in POINT().
      location: `SRID=4326;POINT(${parsed.data.longitude} ${parsed.data.latitude})`,
      location_label: parsed.data.locationLabel,
      dietary_tags: parsed.data.tags,
    })
    .select("id")
    .single();

  if (insertError) {
    // Don't leave an orphaned photo behind if the row failed to insert.
    await supabase.storage.from("post-photos").remove([photoPath]);
    return fail(`Couldn't create the post: ${insertError.message}`);
  }

  // TODO (step 5): redirect to /post/${post.id} once post detail exists.
  void post;
  redirect("/");
}
