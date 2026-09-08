"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Camera, Loader2 } from "lucide-react";

import { createPost } from "@/app/actions/posts";
import { LocationPicker, type Coords } from "@/components/location-picker";
import { compressPhoto } from "@/lib/posts/compress-photo";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { initialCreatePostState } from "@/lib/posts/create-post-state";
import { TAG_GROUPS, TAG_LABELS, type Tag } from "@/lib/posts/tags";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || disabled;
  return (
    <Button type="submit" size="lg" className="w-full" disabled={busy}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? "Posting…" : "Post food"}
    </Button>
  );
}

export function CreatePostForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(createPost, initialCreatePostState);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [coords, setCoords] = useState<Coords | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  /**
   * Upload as soon as a photo is chosen rather than on submit: it overlaps the
   * transfer with the time spent filling in the rest of the form, which matters
   * for the ~15s posting budget, and it keeps the form a plain action submit.
   */
  async function uploadPhoto(original: File) {
    setUploading(true);
    setUploadError(null);
    setPhotoPath(null);

    // Downscale and re-encode first: shrinks a 4 MB phone photo to a few
    // hundred KB, and converts HEIC to something browsers can display.
    const file = await compressPhoto(original);

    const extension =
      file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    // First path segment must be the user id — the storage policy checks it.
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;

    setPhotoPreview(URL.createObjectURL(file));

    const supabase = createClient();
    const { error } = await supabase.storage
      .from("post-photos")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      setUploadError(`Couldn't upload that photo: ${error.message}`);
    } else {
      setPhotoPath(path);
    }
    setUploading(false);
  }

  function toggleTag(tag: Tag) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* Photo — required (PRD §5.3) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            ref={photoInputRef}
            id="photo"
            // Deliberately unnamed: a named file input is serialized into the
            // Server Action payload, which is capped at 1 MB. The file is
            // uploaded straight to Storage instead, and only `photoPath` is
            // submitted with the form.
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />

          {photoPreview ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-md border">
              <Image
                src={photoPreview}
                alt="The food you're posting"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : null}

          <Button
            type="button"
            variant={photoPreview ? "outline" : "default"}
            onClick={() => photoInputRef.current?.click()}
          >
            <Camera className="size-4" />
            {photoPreview ? "Choose a different photo" : "Take or choose a photo"}
          </Button>
          <input type="hidden" name="photoPath" value={photoPath ?? ""} />

          {uploading ? (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3 animate-spin" />
              Uploading photo…
            </p>
          ) : null}

          {uploadError ? (
            <p role="alert" className="text-destructive text-xs">
              {uploadError}
            </p>
          ) : null}

          <p className="text-muted-foreground text-xs">
            A photo is required — it&apos;s what makes a listing believable.
          </p>
        </CardContent>
      </Card>

      {/* Description + servings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What is it?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              required
              rows={3}
              maxLength={500}
              placeholder="Leftover pizza from the SEAS info session — cheese and pepperoni"
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] md:text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="servings">Servings left</Label>
            <Input
              id="servings"
              name="servings"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              defaultValue={4}
              required
              className="max-w-32"
            />
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where is it?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationLabel">Building or room</Label>
            <Input
              id="locationLabel"
              name="locationLabel"
              required
              maxLength={120}
              placeholder="Towne 100"
            />
          </div>

          <input type="hidden" name="latitude" value={coords?.latitude ?? ""} />
          <input type="hidden" name="longitude" value={coords?.longitude ?? ""} />

          <LocationPicker value={coords} onChange={setCoords} />
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {selectedTags.map((tag) => (
            <input key={tag} type="hidden" name="tags" value={tag} />
          ))}

          {TAG_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-accent",
                      )}
                    >
                      {TAG_LABELS[tag]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-muted-foreground text-xs">
            Allergen tags are a courtesy, not a guarantee — anyone with a serious
            allergy should ask the poster directly.
          </p>
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton disabled={uploading || !photoPath} />
    </form>
  );
}
