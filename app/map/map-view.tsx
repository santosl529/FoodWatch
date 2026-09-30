"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// maplibre-gl v6 is ESM with named exports only — there is no default export.
import type maplibregl from "maplibre-gl";
import {
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from "maplibre-gl";
import { MessageCircle, UtensilsCrossed, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CAMPUS_CENTER,
  CAMPUS_DEFAULT_ZOOM,
  MAP_STYLE_URL,
} from "@/lib/map/config";
import { circlePolygon } from "@/lib/geo/circle";
import { reportViewerLocation } from "@/lib/geo/report-viewer-location";
import { distanceLabel, photoUrl, timeAgo, type FeedPost } from "@/lib/posts/feed";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Map of active posts (PRD §5.5).
 *
 * Markers are plain DOM elements rather than a GeoJSON symbol layer: at tens of
 * posts the performance difference is irrelevant, and DOM markers let the pin
 * be styled with the same Tailwind tokens as the rest of the app. Revisit if
 * this ever needs to draw thousands.
 */
export function MapView({
  posts,
  radiusMeters,
}: {
  posts: FeedPost[];
  /** From notification settings; the circle drawn around the viewer. */
  radiusMeters: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const lastPositionRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<FeedPost | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: [CAMPUS_CENTER.longitude, CAMPUS_CENTER.latitude],
        zoom: CAMPUS_DEFAULT_ZOOM,
        attributionControl: { compact: true },
      });
    } catch (caught) {
      // A blank map tells you nothing. Surface the reason on the page so a
      // failure here is diagnosable without opening devtools.
      //
      // Suppressed deliberately: reporting a constructor failure is precisely
      // what this state exists for, and there is no render-phase alternative —
      // the error only exists once the effect has tried to build the map.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapError(
        caught instanceof Error ? caught.message : "Map failed to initialise.",
      );
      return;
    }

    map.on("error", (event) => {
      const message = event?.error?.message ?? "Unknown map error";
      console.error("[map]", message, event);
      setMapError(message);
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );

    /**
     * Draws the radius around the last known position.
     *
     * Called from both the style-load handler and the geolocation callback,
     * because either can happen first: `watchPosition` with `maximumAge` can
     * return a cached fix before the style is ready, and if the viewer then
     * doesn't move, it may not fire again for minutes. Drawing only from the
     * geolocation callback meant the circle silently never appeared.
     */
    function drawRadius() {
      const position = lastPositionRef.current;
      if (!position || !radiusMeters || radiusMeters <= 0) return;
      const source = map.getSource("radius-area");
      if (!source || !("setData" in source)) return;
      (source as maplibregl.GeoJSONSource).setData(
        circlePolygon(position, radiusMeters),
      );
    }

    // Sources and layers can only be added after the style has loaded.
    map.on("load", () => {
      if (!radiusMeters || radiusMeters <= 0) return;
      map.addSource("radius-area", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "radius-area-fill",
        type: "fill",
        source: "radius-area",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "radius-area-outline",
        type: "line",
        source: "radius-area",
        paint: {
          "line-color": "#2563eb",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });

      // The position may already have arrived while the style was loading.
      drawRadius();
    });

    // A live dot for the viewer. GeolocateControl can do this, but only after
    // the user presses it — showing it unprompted answers "how far is that?"
    // without a tap.
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lngLat: [number, number] = [
            position.coords.longitude,
            position.coords.latitude,
          ];
          lastPositionRef.current = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          // Keeps the server's radius check centred where the circle is drawn.
          reportViewerLocation(lastPositionRef.current);
          // No-ops if the style hasn't finished loading; the load handler
          // draws it then.
          drawRadius();

          if (userMarkerRef.current) {
            userMarkerRef.current.setLngLat(lngLat);
            return;
          }
          const dot = document.createElement("div");
          dot.className =
            "size-3.5 rounded-full border-2 border-white bg-blue-600 shadow-md";
          dot.setAttribute("aria-label", "Your location");
          userMarkerRef.current = new Marker({ element: dot })
            .setLngLat(lngLat)
            .addTo(map);
        },
        () => {
          // Declined or unavailable — the map is still perfectly usable.
        },
        { enableHighAccuracy: true, maximumAge: 30_000 },
      );
    }

    mapRef.current = map;
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [radiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const post of posts) {
      const element = document.createElement("button");
      element.type = "button";
      element.setAttribute("aria-label", post.description);
      // Liberty is a detailed, full-colour basemap, so the pin needs strong
      // contrast rather than relying on a muted backdrop.
      // A CSS-drawn pin rather than injected SVG markup: no innerHTML, and the
      // servings count is more useful at a glance than a generic food icon.
      element.className =
        "flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-black text-xs font-semibold text-white shadow-md";
      element.textContent = String(post.servings_remaining);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelected(post);
      });

      const marker = new Marker({ element })
        .setLngLat([post.longitude, post.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    }

    if (posts.length > 0) {
      const bounds = new LngLatBounds();
      for (const post of posts) bounds.extend([post.longitude, post.latitude]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 17, duration: 0 });
    }
  }, [posts]);

  return (
    // An explicit height, not flex-1: MapLibre measures its container on init
    // and renders nothing at all if that measurement is zero — silently, with
    // no error. 3.5rem is the nav (h-14).
    //
    // The underscores are load-bearing: Tailwind turns them into spaces, and
    // CSS calc() requires whitespace around the minus. Written without them the
    // declaration is invalid, gets dropped, and the height silently falls back
    // to auto — which is exactly the 0px container that made this page blank.
    <div className="relative h-[calc(100dvh_-_3.5rem)] w-full">
      {/*
        Explicit h-full/w-full rather than `absolute inset-0`. MapLibre adds
        `.maplibregl-map` to this element, and its stylesheet — which loads
        after Tailwind — sets `position: relative`. That beats Tailwind's
        `absolute`, `inset-0` stops applying, and the container collapses to
        zero height. MapLibre then renders into nothing without erroring, which
        is a genuinely silent failure. Sizing it directly avoids the whole
        argument.
      */}
      <div ref={containerRef} className="h-full w-full" />

      {mapError ? (
        <div className="bg-background absolute inset-x-4 top-4 rounded-md border px-3 py-2 text-sm shadow-sm">
          <p className="text-destructive font-medium">Map failed to load</p>
          <p className="text-muted-foreground mt-1 text-xs">{mapError}</p>
        </div>
      ) : null}

      {posts.length === 0 ? (
        <div className="bg-background/90 absolute inset-x-4 top-4 rounded-md border px-3 py-2 text-sm shadow-sm">
          No active posts right now.
        </div>
      ) : null}

      {selected ? (
        <div className="bg-background absolute inset-x-3 bottom-3 rounded-lg border p-3 shadow-lg">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- see 5b notes */}
            <img
              src={photoUrl(selected.photo_path)}
              alt=""
              className="bg-muted size-20 shrink-0 rounded-md object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-medium">
                  {selected.description}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mt-1 -mr-1 size-7 shrink-0"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span className="flex items-center gap-1">
                  <UtensilsCrossed className="size-3" />
                  {selected.servings_remaining} left
                </span>
                <span>{selected.location_label}</span>
                <span>{timeAgo(selected.bumped_at ?? selected.created_at)}</span>
                {distanceLabel(selected.distance_meters) ? (
                  <span>{distanceLabel(selected.distance_meters)}</span>
                ) : null}
                {selected.comment_count > 0 ? (
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3" />
                    {selected.comment_count}
                  </span>
                ) : null}
              </div>

              <Button asChild size="sm" className="mt-1 self-start">
                <Link href={`/post/${selected.id}`}>Open post</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
