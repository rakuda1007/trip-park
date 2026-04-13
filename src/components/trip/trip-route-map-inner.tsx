"use client";

import { buildOrderedStopQueries } from "@/lib/maps/trip-stops";
import type { TripRouteDoc } from "@/types/trip";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

const mapContainerStyle: CSSProperties = {
  width: "100%",
  height: "min(50vh, 320px)",
  minHeight: "240px",
};

const defaultCenter = { lat: 36.2, lng: 138.25 };
const MAX_INTERMEDIATE_WAYPOINTS = 25;

function directionsErrorMessage(status: google.maps.DirectionsStatus): string {
  switch (status) {
    case "ZERO_RESULTS":
      return "ルートが見つかりませんでした。住所や地名を具体的にしてみてください。";
    case "NOT_FOUND":
      return "地点を特定できませんでした。";
    case "OVER_QUERY_LIMIT":
      return "検索の利用上限に達しています。しばらくしてからお試しください。";
    case "REQUEST_DENIED":
      return "Directions API が拒否されました。API キーと有効な API を確認してください。";
    case "INVALID_REQUEST":
      return "ルート検索のリクエストが不正です。";
    default:
      return "ルート検索に失敗しました。";
  }
}

function formatRouteSummary(result: google.maps.DirectionsResult): string {
  const r = result.routes[0];
  if (!r) return "";
  let meters = 0;
  let seconds = 0;
  for (const leg of r.legs) {
    meters += leg.distance?.value ?? 0;
    seconds += leg.duration?.value ?? 0;
  }
  const km = (meters / 1000).toFixed(1);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const timeStr = h > 0 ? `約 ${h} 時間 ${m} 分` : `約 ${m} 分`;
  return `車のルート: 約 ${km} km · ${timeStr}`;
}

function runDirections(
  map: google.maps.Map,
  stops: string[],
  onSummary: (s: string | null) => void,
  onError: (e: string | null) => void,
  onPolyline?: (p: string) => void,
): () => void {
  onError(null);
  onSummary(null);
  let cancelled = false;
  const renderer = new google.maps.DirectionsRenderer({ map, suppressMarkers: false });
  let marker: google.maps.Marker | null = null;

  if (stops.length === 0) {
    onError("地点が登録されていません。経由地・目的地の名称を入力してください。");
    return () => { renderer.setMap(null); };
  }

  if (stops.length === 1) {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: stops[0], region: "jp" }, (results, status) => {
      if (cancelled) return;
      if (status !== "OK" || !results?.[0]) {
        onError("地点を見つけられませんでした。");
        return;
      }
      const loc = results[0].geometry.location;
      map.setCenter(loc);
      map.setZoom(14);
      marker = new google.maps.Marker({ map, position: loc });
    });
    return () => { cancelled = true; marker?.setMap(null); renderer.setMap(null); };
  }

  const intermediate = stops.slice(1, -1);
  if (intermediate.length > MAX_INTERMEDIATE_WAYPOINTS) {
    onError(`経由地が多すぎます（中間は最大 ${MAX_INTERMEDIATE_WAYPOINTS} か所まで）。`);
    return () => { renderer.setMap(null); };
  }

  const service = new google.maps.DirectionsService();
  service.route(
    {
      origin: stops[0]!,
      destination: stops[stops.length - 1]!,
      waypoints: intermediate.map((location) => ({ location, stopover: true })),
      travelMode: google.maps.TravelMode.DRIVING,
      region: "jp",
      language: "ja",
    },
    (result, status) => {
      if (cancelled) return;
      if (status !== "OK" || !result) {
        onError(directionsErrorMessage(status));
        return;
      }
      renderer.setDirections(result);
      onSummary(formatRouteSummary(result));
      // ポリラインをキャッシュ用に返す
      const polyline = result.routes[0]?.overview_polyline;
      if (polyline && onPolyline) {
        onPolyline(polyline);
      }
    },
  );

  return () => { cancelled = true; marker?.setMap(null); renderer.setMap(null); };
}

export function TripRouteMapInner({
  route,
  apiKey,
  onPolyline,
}: {
  route: TripRouteDoc;
  apiKey: string;
  onPolyline?: (polyline: string) => void;
}) {
  const stops = useMemo(() => buildOrderedStopQueries(route), [route]);
  const { isLoaded, loadError } = useJsApiLoader({
    id: "trip-park-google-maps",
    googleMapsApiKey: apiKey,
    language: "ja",
    region: "JP",
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const onMapLoad = useCallback((m: google.maps.Map) => { setMap(m); }, []);
  const onUnmount = useCallback(() => { setMap(null); }, []);

  useEffect(() => {
    if (!isLoaded || !map) return;
    return runDirections(map, stops, setSummary, setRouteError, onPolyline);
  }, [isLoaded, map, stops]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) {
    return (
      <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
        Google マップの読み込みに失敗しました。API キーと Maps JavaScript API の有効化を確認してください。
      </p>
    );
  }

  if (!isLoaded) {
    return <p className="mt-2 text-sm text-zinc-500">地図を読み込み中…</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {routeError ? (
        <p className="text-sm text-amber-800 dark:text-amber-200" role="alert">{routeError}</p>
      ) : null}
      {summary ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary}</p>
      ) : null}
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={7}
        onLoad={onMapLoad}
        onUnmount={onUnmount}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      />
    </div>
  );
}
