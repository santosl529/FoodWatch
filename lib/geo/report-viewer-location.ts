"use client";

import { saveViewerLocation } from "@/app/actions/notifications";
import {
  shouldSaveViewerLocation,
  type LatLng,
  type SavedViewerLocation,
} from "@/lib/geo/viewer-location";

const STORAGE_KEY = "pff:viewer-location-saved";

function readLast(): SavedViewerLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedViewerLocation) : null;
  } catch {
    return null;
  }
}

function writeLast(value: SavedViewerLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / storage blocked: we just save a little more often.
  }
}

/**
 * Hand every position fix here; it decides whether it's worth a write (9h).
 * The throttle memory lives in localStorage so moving between the feed and the
 * map doesn't re-save on each page. Fire-and-forget — a failed save just means
 * the server keeps the previous centre.
 */
export function reportViewerLocation(coords: LatLng) {
  const now = Date.now();
  if (!shouldSaveViewerLocation(readLast(), coords, now)) return;
  writeLast({ coords, savedAt: now });
  void saveViewerLocation(coords).catch(() => {});
}
