import { z } from "zod";

import type { Coords, PlaceSuggestion } from "./types";

/**
 * Photon (komoot) — an OpenStreetMap geocoder built for search-as-you-type.
 * No key and no signup, like the OpenFreeMap tiles, so it can be called
 * straight from the browser. Nominatim's usage policy forbids autocomplete,
 * which rules it out. Swapping provider means replacing this file.
 */
const PHOTON_URL = "https://photon.komoot.io/api/";

/** Philadelphia, roughly — keeps "Walnut St" from resolving to another city. */
const PHILLY_BBOX = "-75.30,39.87,-75.05,40.05";

export function photonUrl(query: string, bias: Coords, limit = 6): string {
  const params = new URLSearchParams({
    q: query,
    lat: String(bias.latitude),
    lon: String(bias.longitude),
    bbox: PHILLY_BBOX,
    limit: String(limit),
    lang: "en",
  });
  return `${PHOTON_URL}?${params}`;
}

const featureSchema = z.object({
  properties: z.object({
    osm_type: z.string(),
    osm_id: z.number(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }),
});

export function photonToSuggestions(json: unknown): PlaceSuggestion[] {
  const features = z
    .object({ features: z.array(z.unknown()) })
    .safeParse(json);
  if (!features.success) return [];

  const suggestions: PlaceSuggestion[] = [];
  for (const raw of features.data.features) {
    const feature = featureSchema.safeParse(raw);
    if (!feature.success) continue;

    const { properties: p, geometry } = feature.data;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name ?? street;
    if (!name) continue;

    const secondary = [p.name ? street : "", p.city ?? ""]
      .filter(Boolean)
      .join(", ");

    const [longitude, latitude] = geometry.coordinates;
    suggestions.push({
      id: `${p.osm_type}${p.osm_id}`,
      name,
      secondary: secondary || null,
      coords: { latitude, longitude },
      source: "address",
    });
  }
  return suggestions;
}
