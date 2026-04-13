import type { TripRouteDoc, TripWaypoint } from "@/types/trip";

function waypointQuery(w: TripWaypoint): string | null {
  const memo = typeof w.memo === "string" ? w.memo.trim() : "";
  const name = typeof w.name === "string" ? w.name.trim() : "";
  if (memo && name) return `${memo} ${name}`;
  if (memo) return memo;
  if (name) return name;
  return null;
}

function destinationQuery(route: TripRouteDoc): string | null {
  const name = route.destinationName?.trim() ?? "";
  return name || null;
}

/**
 * 車ルートの順序: 経由地（上から順）→ 最後に目的地。
 */
export function buildOrderedStopQueries(route: TripRouteDoc): string[] {
  const out: string[] = [];
  for (const w of route.waypoints ?? []) {
    const q = waypointQuery(w);
    if (q) out.push(q);
  }
  const dest = destinationQuery(route);
  if (dest) out.push(dest);
  return out;
}
