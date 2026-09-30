import { CAMPUS_CENTER } from "@/lib/map/config";
import { matchPennPlaces, mergeSuggestions } from "@/lib/places/penn";
import { photonToSuggestions, photonUrl } from "@/lib/places/photon";
import type { PlaceSuggestion } from "@/lib/places/types";

/**
 * Penn mapping + geocoder, merged. A geocoder failure isn't fatal — the Penn
 * matches (and the typed-text fallback in the picker) still work — so it's
 * reported rather than thrown. Aborts propagate so stale requests are dropped.
 */
export async function searchPlaces(
  query: string,
  signal: AbortSignal,
): Promise<{ suggestions: PlaceSuggestion[]; geocoderFailed: boolean }> {
  const penn = matchPennPlaces(query);
  try {
    const response = await fetch(photonUrl(query, CAMPUS_CENTER), { signal });
    if (!response.ok) throw new Error(`Photon ${response.status}`);
    const address = photonToSuggestions(await response.json());
    return { suggestions: mergeSuggestions(penn, address), geocoderFailed: false };
  } catch (error) {
    if (signal.aborted) throw error;
    return { suggestions: penn, geocoderFailed: true };
  }
}
