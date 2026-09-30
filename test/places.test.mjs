/**
 * Unit tests for the location-autofill helpers (lib/places). Pure functions —
 * no Supabase, no network. Node strips the TypeScript types on import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { composeLocationLabel } from "../lib/places/label.ts";
import {
  matchPennPlaces,
  mergeSuggestions,
  normalizeName,
} from "../lib/places/penn.ts";
import { photonToSuggestions, photonUrl } from "../lib/places/photon.ts";

const HUNTSMAN = {
  name: "Huntsman Hall",
  aliases: ["JMHH", "Huntsman", "John M. Huntsman Hall"],
  address: "3730 Walnut St",
  coords: { latitude: 39.953, longitude: -75.1982 },
};
const VANPELT = {
  name: "Van Pelt Library",
  aliases: ["VP", "Van Pelt"],
  address: "3420 Walnut St",
  coords: { latitude: 39.9527, longitude: -75.1934 },
};
const PLACES = [VANPELT, HUNTSMAN];

test("normalizeName folds case, punctuation and whitespace", () => {
  assert.equal(normalizeName("  John M.  Huntsman-Hall "), "john m huntsman hall");
});

test("matchPennPlaces matches colloquial aliases, case-insensitively", () => {
  const [hit] = matchPennPlaces("jmhh", PLACES);
  assert.equal(hit.name, "Huntsman Hall");
  assert.equal(hit.secondary, "3730 Walnut St");
  assert.deepEqual(hit.coords, HUNTSMAN.coords);
  assert.equal(hit.source, "penn");
});

test("matchPennPlaces returns each place once even when several aliases match", () => {
  const hits = matchPennPlaces("huntsman", PLACES);
  assert.equal(hits.length, 1);
});

test("matchPennPlaces ranks prefix matches ahead of mid-string matches", () => {
  const places = [
    { ...HUNTSMAN, name: "Old Pelt House", aliases: [] }, // mid-string only
    { ...VANPELT, aliases: ["Pelt"] }, // alias is a prefix match
  ];
  const hits = matchPennPlaces("pelt", places);
  assert.deepEqual(
    hits.map((h) => h.name),
    ["Van Pelt Library", "Old Pelt House"],
  );
});

test("matchPennPlaces ignores empty queries", () => {
  assert.deepEqual(matchPennPlaces("  ", PLACES), []);
});

test("mergeSuggestions puts Penn places first and drops address duplicates", () => {
  const penn = matchPennPlaces("huntsman", PLACES);
  const address = [
    { id: "W1", name: "John M. Huntsman Hall", secondary: null, coords: null, source: "address" },
    { id: "W2", name: "Huntsman Hall", secondary: "Locust Walk", coords: null, source: "address" },
    { id: "W3", name: "3730 Walnut Street", secondary: null, coords: null, source: "address" },
  ];
  const merged = mergeSuggestions(penn, address, PLACES);
  assert.deepEqual(
    merged.map((s) => s.id),
    [penn[0].id, "W3"],
  );
});

test("photonToSuggestions uses the OSM name and puts the street address second", () => {
  const [s] = photonToSuggestions({
    features: [
      {
        properties: {
          osm_type: "R",
          osm_id: 4626869,
          name: "Levine Hall",
          housenumber: "3330",
          street: "Walnut Street",
          city: "Philadelphia",
        },
        geometry: { type: "Point", coordinates: [-75.1910852, 39.9521867] },
      },
    ],
  });
  assert.deepEqual(s, {
    id: "R4626869",
    name: "Levine Hall",
    secondary: "3330 Walnut Street, Philadelphia",
    coords: { latitude: 39.9521867, longitude: -75.1910852 },
    source: "address",
  });
});

test("photonToSuggestions falls back to the street address when there's no name", () => {
  const [s] = photonToSuggestions({
    features: [
      {
        properties: {
          osm_type: "N",
          osm_id: 7,
          housenumber: "3401",
          street: "Walnut Street",
          city: "Philadelphia",
        },
        geometry: { type: "Point", coordinates: [-75.19, 39.95] },
      },
    ],
  });
  assert.equal(s.name, "3401 Walnut Street");
  assert.equal(s.secondary, "Philadelphia");
});

test("photonToSuggestions tolerates junk instead of throwing", () => {
  assert.deepEqual(photonToSuggestions(null), []);
  assert.deepEqual(photonToSuggestions({ features: [{ nope: true }] }), []);
});

test("photonUrl biases toward the given point and bounds to Philadelphia", () => {
  const url = new URL(photonUrl("levine", { latitude: 39.95, longitude: -75.19 }));
  assert.equal(url.searchParams.get("q"), "levine");
  assert.equal(url.searchParams.get("lat"), "39.95");
  assert.equal(url.searchParams.get("lon"), "-75.19");
  assert.ok(url.searchParams.get("bbox"));
});

test("composeLocationLabel appends trimmed details with a separator", () => {
  assert.equal(composeLocationLabel("Levine Hall", "  room 101 "), "Levine Hall · room 101");
  assert.equal(composeLocationLabel("Levine Hall", "   "), "Levine Hall");
  assert.equal(composeLocationLabel("", "room 101"), "");
});
