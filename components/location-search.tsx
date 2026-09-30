"use client";

import { useEffect, useId, useState } from "react";
import { Building2, Loader2, MapPin, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { composeLocationLabel } from "@/lib/places/label";
import { searchPlaces } from "@/lib/places/search";
import type { Coords, PlaceSuggestion } from "@/lib/places/types";
import { cn } from "@/lib/utils";

const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;
const LABEL_MAX = 120;
const SEPARATOR_LENGTH = " · ".length;

/**
 * Address / building autofill (PRD §6.4). Picking a suggestion locks it in as a
 * chip and moves the map pin; an optional details field carries the room or
 * floor, which an address alone loses. The composed label is submitted as
 * `locationLabel`.
 *
 * The last option is always "use what I typed", so a geocoder outage or an
 * unmapped spot never blocks posting — it just doesn't move the pin.
 */
export function LocationSearch({
  onPick,
}: {
  onPick: (coords: Coords) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [geocoderFailed, setGeocoderFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<PlaceSuggestion | null>(null);
  const [details, setDetails] = useState("");

  const trimmed = query.trim();
  const canSearch = !selected && trimmed.length >= MIN_QUERY;

  useEffect(() => {
    if (!canSearch) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await searchPlaces(trimmed, controller.signal);
        setResults(result.suggestions);
        setGeocoderFailed(result.geocoderFailed);
        setActive(0);
        setSearching(false);
      } catch {
        // Aborted by a newer keystroke — the cleanup below reset the spinner.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setSearching(false);
    };
  }, [canSearch, trimmed]);

  const typed: PlaceSuggestion | null =
    trimmed.length >= 2
      ? {
          id: "typed",
          name: trimmed,
          secondary: "Use what I typed — set the pin on the map",
          coords: null,
          source: "typed",
        }
      : null;
  const options = [...(canSearch ? results : []), ...(typed ? [typed] : [])];
  const showList = open && !selected && options.length > 0;

  function pick(option: PlaceSuggestion) {
    setSelected(option);
    setOpen(false);
    if (option.coords) onPick(option.coords);
  }

  function clear() {
    setSelected(null);
    setResults([]);
    setOpen(true);
  }

  const label = selected ? composeLocationLabel(selected.name, details) : "";
  const detailsMax = selected
    ? Math.max(0, LABEL_MAX - selected.name.length - SEPARATOR_LENGTH)
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="locationLabel" value={label} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="locationSearch">Building or address</Label>

        {selected ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <SourceIcon source={selected.source} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selected.name}</p>
              {selected.source !== "typed" && selected.secondary ? (
                <p className="text-muted-foreground truncate text-xs">
                  {selected.secondary}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={clear}
              aria-label="Change location"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              id="locationSearch"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder="Levine Hall, 3401 Walnut St…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(event) => {
                if (!showList) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => (i + 1) % options.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => (i - 1 + options.length) % options.length);
                } else if (event.key === "Enter") {
                  // Otherwise Enter submits the whole post form.
                  event.preventDefault();
                  pick(options[Math.min(active, options.length - 1)]);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
            {searching ? (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
            ) : null}

            {showList ? (
              <ul
                id={listId}
                role="listbox"
                className="bg-popover absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-md"
              >
                {options.map((option, index) => (
                  <li
                    key={option.id}
                    role="option"
                    aria-selected={index === active}
                    // mousedown, not click: click fires after the input's blur
                    // has already closed the list.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(option);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 px-3 py-2",
                      index === active && "bg-accent",
                    )}
                  >
                    <SourceIcon source={option.source} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{option.name}</p>
                      {option.secondary ? (
                        <p className="text-muted-foreground truncate text-xs">
                          {option.secondary}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {!selected && geocoderFailed && canSearch ? (
          <p className="text-muted-foreground text-xs">
            Address search isn&apos;t responding — you can still use what you
            typed and set the pin by hand.
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationDetails">
            Room, floor or details{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="locationDetails"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={detailsMax}
            placeholder="Room 101, 3rd floor lounge…"
          />
        </div>
      ) : null}
    </div>
  );
}

function SourceIcon({ source }: { source: PlaceSuggestion["source"] }) {
  const Icon =
    source === "penn" ? Building2 : source === "typed" ? Pencil : MapPin;
  return <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />;
}
