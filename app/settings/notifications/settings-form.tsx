"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";

import { saveNotificationSettings } from "@/app/actions/notifications";
import { LocationPicker, type Coords } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAMPUS_CENTER } from "@/lib/map/config";
import { cn } from "@/lib/utils";
import {
  initialNotificationSettingsState,
  type NotificationPreferences,
} from "@/lib/notifications/state";
import { TAG_GROUPS, TAG_LABELS, type Tag } from "@/lib/posts/tags";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Save preferences
    </Button>
  );
}

function TagPicker({
  name,
  selected,
  onToggle,
}: {
  name: string;
  selected: Tag[];
  onToggle: (tag: Tag) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {selected.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
      {TAG_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.tags.map((tag) => {
              const active = selected.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(tag)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
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
    </div>
  );
}

export function NotificationSettingsForm({
  preferences,
}: {
  preferences: NotificationPreferences | null;
}) {
  const [state, formAction] = useActionState(
    saveNotificationSettings,
    initialNotificationSettingsState,
  );

  // Default to campus centre rather than null. The picker renders a pin there
  // regardless, and a user quite reasonably reads that pin as their choice —
  // leaving the value unset is how an unmoved pin silently became (0, 0).
  const [coords, setCoords] = useState<Coords>(
    preferences?.latitude != null && preferences?.longitude != null
      ? { latitude: preferences.latitude, longitude: preferences.longitude }
      : { latitude: CAMPUS_CENTER.latitude, longitude: CAMPUS_CENTER.longitude },
  );
  const [require, setRequire] = useState<Tag[]>(
    preferences?.dietary_filter?.require ?? [],
  );
  const [exclude, setExclude] = useState<Tag[]>(
    preferences?.dietary_filter?.exclude ?? [],
  );

  function toggle(list: Tag[], setList: (tags: Tag[]) => void, tag: Tag) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where to watch</CardTitle>
          <CardDescription>
            Set a radius, a list of buildings, or both. With neither, you
            won&apos;t get any new-post notifications — comment replies still
            reach you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="radiusMeters">Notify me within (metres)</Label>
            <Input
              id="radiusMeters"
              name="radiusMeters"
              type="number"
              min={50}
              max={5000}
              step={50}
              placeholder="500"
              defaultValue={preferences?.radius_meters ?? ""}
              className="max-w-40"
            />
          </div>

          <input type="hidden" name="latitude" value={coords?.latitude ?? ""} />
          <input type="hidden" name="longitude" value={coords?.longitude ?? ""} />
          <LocationPicker value={coords} onChange={setCoords} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="buildingLabels">Buildings to watch</Label>
            <Input
              id="buildingLabels"
              name="buildingLabels"
              placeholder="Towne 100, Huntsman Hall, Van Pelt"
              defaultValue={(preferences?.building_labels ?? []).join(", ")}
            />
            <p className="text-muted-foreground text-xs">
              Comma-separated. Matched against a post&apos;s building label,
              ignoring case.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Only tell me about food that is…</CardTitle>
          <CardDescription>
            A post must carry every tag you pick here. Leave empty for anything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TagPicker
            name="require"
            selected={require}
            onToggle={(tag) => toggle(require, setRequire, tag)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Never tell me about food with…</CardTitle>
          <CardDescription>
            Useful for allergens. A post carrying any of these won&apos;t notify
            you — but treat that as a filter, not a safety guarantee.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TagPicker
            name="exclude"
            selected={exclude}
            onToggle={(tag) => toggle(exclude, setExclude, tag)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replies</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="notifyOnComment"
              defaultChecked={preferences?.notify_on_comment ?? true}
              className="size-4"
            />
            Tell me when someone comments on my post
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.saved && !state.error ? (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Check className="size-4" />
            Saved
          </span>
        ) : null}
        {state.error ? (
          <span role="alert" className="text-destructive text-sm">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
