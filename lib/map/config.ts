/**
 * Map configuration (PRD §5.5, §11 tile-provider decision).
 *
 * OpenFreeMap serves OpenStreetMap vector tiles with no API key, no signup and
 * no usage limits. That matters twice over: nothing secret ships to the client,
 * and a future iOS/Android client using MapLibre Native reads this same style
 * URL. Key-based providers restrict free tiers by HTTP referrer, which native
 * apps don't send — so they force either a proxy or an exposed key.
 *
 * Switching provider or style is a one-line change here.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** College Green, roughly the centre of Penn's campus. */
export const CAMPUS_CENTER = { longitude: -75.1932, latitude: 39.9522 };

export const CAMPUS_DEFAULT_ZOOM = 15;

/** Zoom used when focusing a single post. */
export const POST_FOCUS_ZOOM = 17;
