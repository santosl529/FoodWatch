/**
 * Unit tests for the viewer-location save throttle (lib/geo/viewer-location).
 * Pure functions — no Supabase, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  metersBetween,
  shouldSaveViewerLocation,
  MIN_MOVE_METERS,
  MIN_INTERVAL_MS,
} from "../lib/geo/viewer-location.ts";

const VAN_PELT = { latitude: 39.9527, longitude: -75.1934 };
// ~111 m north (0.001° latitude).
const NEAR = { latitude: 39.9537, longitude: -75.1934 };
// ~555 m north.
const FAR = { latitude: 39.9577, longitude: -75.1934 };

test("metersBetween is roughly right at Penn's latitude", () => {
  const d = metersBetween(VAN_PELT, NEAR);
  assert.ok(d > 105 && d < 117, `expected ~111 m, got ${d}`);
});

test("saves when nothing has been saved yet", () => {
  assert.equal(shouldSaveViewerLocation(null, VAN_PELT, 0), true);
});

test("skips a small move soon after the last save", () => {
  const last = { coords: VAN_PELT, savedAt: 1_000 };
  assert.equal(shouldSaveViewerLocation(last, NEAR, 1_000 + 60_000), false);
});

test("saves after moving far enough, however soon", () => {
  const last = { coords: VAN_PELT, savedAt: 1_000 };
  assert.ok(metersBetween(VAN_PELT, FAR) > MIN_MOVE_METERS);
  assert.equal(shouldSaveViewerLocation(last, FAR, 1_000 + 1), true);
});

test("saves a small move once enough time has passed", () => {
  const last = { coords: VAN_PELT, savedAt: 1_000 };
  assert.equal(
    shouldSaveViewerLocation(last, NEAR, 1_000 + MIN_INTERVAL_MS),
    true,
  );
});
