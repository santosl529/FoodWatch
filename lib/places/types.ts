/**
 * Location autofill (PRD §6.4). Suggestions come from two sources — the
 * hand-kept Penn building mapping and the OpenStreetMap geocoder — plus the
 * "use what I typed" fallback, all in one shape so the picker doesn't care.
 */
export type Coords = { latitude: number; longitude: number };

export type PlaceSuggestion = {
  id: string;
  /** What goes on the post: building name, or the street address. */
  name: string;
  /** Disambiguating line under the name (address, city); display only. */
  secondary: string | null;
  /** Null for the typed-text fallback, which doesn't move the pin. */
  coords: Coords | null;
  source: "penn" | "address" | "typed";
};
