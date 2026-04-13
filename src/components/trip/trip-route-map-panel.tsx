"use client";

import { buildGoogleMapsDirectionsUrl } from "@/lib/maps/google-maps-dir-url";
import { buildOrderedStopQueries } from "@/lib/maps/trip-stops";
import { saveRoutePolyline } from "@/lib/firestore/trip";
import type { TripRouteDoc } from "@/types/trip";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

const TripRouteMapInner = dynamic(
  () => import("./trip-route-map-inner").then((m) => ({ default: m.TripRouteMapInner })),
  { ssr: false, loading: () => <p className="mt-2 text-sm text-zinc-500">地図を読み込み中…</p> },
);

export function TripRouteMapPanel({
  route,
  groupId,
  routeId,
}: {
  route: TripRouteDoc;
  groupId: string;
  routeId: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const stops = useMemo(() => buildOrderedStopQueries(route), [route]);
  const fallbackUrl = useMemo(() => buildGoogleMapsDirectionsUrl(stops), [stops]);

  // キャッシュ済みポリラインから Static Maps URL を生成
  const cachedStaticUrl = useMemo(() => {
    if (!route.routePolyline || !apiKey) return null;
    return `https://maps.googleapis.com/maps/api/staticmap?size=640x320&path=weight:5%7Ccolor:0x2563EB%7Cenc:${encodeURIComponent(route.routePolyline)}&key=${apiKey}`;
  }, [route.routePolyline, apiKey]);

  // キャッシュ済み画像がある場合は展開済みとして扱う
  const [open, setOpen] = useState(!!cachedStaticUrl || !!route.routePolyline);

  async function handlePolyline(polyline: string) {
    try {
      await saveRoutePolyline(groupId, routeId, polyline);
    } catch {
      // キャッシュ保存失敗は無視
    }
  }

  // 地点が何も登録されていない場合は表示しない
  if (stops.length === 0 && !fallbackUrl) return null;

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-600 dark:bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-600 dark:text-zinc-200"
      >
        {open ? "地図を閉じる" : "地図でルートを表示"}
        {route.routePolyline ? (
          <span className="ml-1.5 text-[10px] font-normal text-zinc-400">（キャッシュ済み）</span>
        ) : null}
      </button>

      {open && apiKey ? (
        cachedStaticUrl ? (
          /* キャッシュ済みポリラインからの静的地図 */
          <div className="mt-3">
            <img
              src={cachedStaticUrl}
              alt="ルート地図"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
            <button
              type="button"
              onClick={async () => {
                // 再描画してキャッシュを更新
                await saveRoutePolyline(groupId, routeId, "");
                setOpen(false);
                setTimeout(() => setOpen(true), 100);
              }}
              className="mt-1 text-[11px] text-zinc-400 underline hover:text-zinc-600"
            >
              地図を再取得
            </button>
          </div>
        ) : (
          /* 初回: Directions API で描画し、ポリラインをキャッシュ保存 */
          <TripRouteMapInner route={route} apiKey={apiKey} onPolyline={handlePolyline} />
        )
      ) : null}

      {open && !apiKey ? (
        <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          {fallbackUrl ? (
            <p>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline dark:text-emerald-400"
              >
                Google マップで同じルートを開く
              </a>
              <span className="ml-1 text-xs text-zinc-400">（アプリ内表示にはAPIキーが必要です）</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
