/**
 * The `location_label` stored on a post: the picked place, plus the optional
 * room/floor detail ("Levine Hall · room 101").
 */
export function composeLocationLabel(name: string, details: string): string {
  const place = name.trim();
  if (!place) return "";
  const extra = details.trim();
  return extra ? `${place} · ${extra}` : place;
}
