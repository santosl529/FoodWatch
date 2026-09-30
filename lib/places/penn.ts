import type { Coords, PlaceSuggestion } from "./types";

/**
 * Hand-kept mapping of Penn buildings to the names students actually use.
 *
 * OpenStreetMap already knows formal names ("John M. Huntsman Hall"), so the
 * geocoder covers those. This list exists for the colloquial ones it can't
 * know — "JMHH", "VP", "Hill" — and to pin a building to the exact spot you
 * want rather than wherever OSM puts it. Matches here rank above geocoder
 * results.
 *
 * Example entry:
 *   {
 *     name: "Huntsman Hall",
 *     aliases: ["JMHH", "Huntsman"],
 *     address: "3730 Walnut St",
 *     coords: { latitude: 39.953, longitude: -75.1982 },
 *   },
 */
export type PennPlace = {
  /** Canonical name — this is what's stored on the post. */
  name: string;
  aliases: string[];
  address: string;
  coords: Coords;
};

export const PENN_PLACES: PennPlace[] = [];

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toSuggestion(place: PennPlace): PlaceSuggestion {
  return {
    id: `penn:${normalizeName(place.name)}`,
    name: place.name,
    secondary: place.address,
    coords: place.coords,
    source: "penn",
  };
}

/** Places whose name or any alias contains the query; prefix matches first. */
export function matchPennPlaces(
  query: string,
  places: PennPlace[] = PENN_PLACES,
  limit = 5,
): PlaceSuggestion[] {
  const q = normalizeName(query);
  if (!q) return [];

  const scored: { place: PennPlace; rank: number }[] = [];
  for (const place of places) {
    const names = [place.name, ...place.aliases].map(normalizeName);
    if (names.some((n) => n.startsWith(q))) {
      scored.push({ place, rank: 0 });
    } else if (names.some((n) => n.includes(q))) {
      scored.push({ place, rank: 1 });
    }
  }

  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ place }) => toSuggestion(place));
}

/**
 * Penn matches first, then geocoder results — minus any the Penn list already
 * covers, so "Huntsman" doesn't show up twice under two spellings.
 */
export function mergeSuggestions(
  penn: PlaceSuggestion[],
  address: PlaceSuggestion[],
  places: PennPlace[] = PENN_PLACES,
): PlaceSuggestion[] {
  const known = new Set<string>();
  for (const place of places) {
    if (!penn.some((s) => s.name === place.name)) continue;
    for (const n of [place.name, ...place.aliases]) known.add(normalizeName(n));
  }
  return [...penn, ...address.filter((s) => !known.has(normalizeName(s.name)))];
}
