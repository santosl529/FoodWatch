"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Camera, Loader2, MapPin } from "lucide-react";

import { createPost } from "@/app/actions/posts";
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? "Posting…" : "Post food"}
    </Button>
  );
}

type Coords = { latitude: number; longitude: number };

export function CreatePostForm() {
  const [state, formAction] = useActionState(createPost, initialCreatePostState);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function toggleTag(tag: Tag) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("This browser can't share a location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied — you can still post by entering the building name, but the map and distance ranking need coordinates."
            : "Couldn't get your location. Try again.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
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
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            required
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPhotoPreview(file ? URL.createObjectURL(file) : null);
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

          <input
            type="hidden"
            name="latitude"
            value={coords?.latitude ?? ""}
          />
          <input
            type="hidden"
            name="longitude"
            value={coords?.longitude ?? ""}
          />

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={useMyLocation}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MapPin className="size-4" />
              )}
              {coords ? "Update my location" : "Use my location"}
            </Button>

            {coords ? (
              <p className="text-muted-foreground text-xs">
                Pinned at {coords.latitude.toFixed(5)},{" "}
                {coords.longitude.toFixed(5)}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Needed for the map and for ranking posts by distance.
              </p>
            )}

            {locationError ? (
              <p role="alert" className="text-destructive text-xs">
                {locationError}
              </p>
            ) : null}
          </div>
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

      <SubmitButton />
    </form>
  );
}
