"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// maplibre-gl v6 is ESM with named exports only — there is no default export.
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
export function MapView({ posts }: { posts: FeedPost[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [selected, setSelected] = useState<FeedPost | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CAMPUS_CENTER.longitude, CAMPUS_CENTER.latitude],
      zoom: CAMPUS_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    <div className="relative flex-1">
      <div ref={containerRef} className="absolute inset-0" />

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
