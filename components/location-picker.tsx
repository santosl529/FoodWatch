"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CAMPUS_CENTER,
  CAMPUS_DEFAULT_ZOOM,
  MAP_STYLE_URL,
  POST_FOCUS_ZOOM,
} from "@/lib/map/config";

import "maplibre-gl/dist/maplibre-gl.css";

export type Coords = { latitude: number; longitude: number };

/**
 * Pick where the food is (PRD §6.4).
 *
 * Geolocation is the fast path, but it must not be the only path: until this
 * existed, a student who declined the browser permission prompt could not post
 * at all, because `posts.location` is non-null. Dragging the pin — or just
 * tapping the map — is the documented alternative.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: Coords | null;
  onChange: (coords: Coords) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // Held in a ref so the map-init effect can stay dependency-free without
  // capturing a stale callback. Updated in an effect, not during render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CAMPUS_CENTER.longitude, CAMPUS_CENTER.latitude],
      zoom: CAMPUS_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    const element = document.createElement("div");
    element.className =
      "size-6 rounded-full border-2 border-white bg-black shadow-md";

    const marker = new Marker({ element, draggable: true })
      .setLngLat([CAMPUS_CENTER.longitude, CAMPUS_CENTER.latitude])
      .addTo(map);

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      onChangeRef.current({ latitude: lat, longitude: lng });
    });

    map.on("click", (event) => {
      marker.setLngLat(event.lngLat);
      onChangeRef.current({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Keep the marker in step when the parent sets coordinates (geolocation).
  useEffect(() => {
    if (!value || !markerRef.current || !mapRef.current) return;
    markerRef.current.setLngLat([value.longitude, value.latitude]);
    mapRef.current.easeTo({
      center: [value.longitude, value.latitude],
      zoom: POST_FOCUS_ZOOM,
      duration: 400,
    });
  }, [value]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share a location — drag the pin instead.");
      return;
    }
    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChangeRef.current({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      (geoError) => {
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location is off — tap the map or drag the pin to where the food is."
            : "Couldn't get your location. Tap the map instead.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-md border"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MapPin className="size-4" />
          )}
          Use my location
        </Button>
        <span className="text-muted-foreground text-xs">
          {value
            ? `Pinned at ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : "Tap the map or drag the pin to set the spot."}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-muted-foreground text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
