/**
 * アプリ内 API キーなしでも、Google マップのナビ（たたき）を開く。
 * @see https://developers.google.com/maps/documentation/urls/get-started
 */
export function buildGoogleMapsDirectionsUrl(stops: string[]): string | null {
  if (stops.length === 0) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  if (stops.length === 1) {
    return `${base}&destination=${encodeURIComponent(stops[0]!)}`;
  }
  const params = new URLSearchParams();
  params.set("origin", stops[0]!);
  params.set("destination", stops[stops.length - 1]!);
  if (stops.length > 2) {
    const mid = stops
      .slice(1, -1)
      .map((s) => encodeURIComponent(s))
      .join("|");
    params.set("waypoints", mid);
  }
  return `${base}&${params.toString()}`;
}
