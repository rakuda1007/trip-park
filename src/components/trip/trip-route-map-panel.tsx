"use client";

import { buildGoogleMapsDirectionsUrl } from "@/lib/maps/google-maps-dir-url";
import { buildOrderedStopQueries } from "@/lib/maps/trip-stops";
import type { TripRouteDoc } from "@/types/trip";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

const TripRouteMapInner = dynamic(
  () =>
    import("./trip-route-map-inner").then((m) => ({
      default: m.TripRouteMapInner,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="mt-2 text-sm text-zinc-500">地図を読み込み中…</p>
    ),
  },
);

export function TripRouteMapPanel({ route }: { route: TripRouteDoc }) {
  const [open, setOpen] = useState(false);
  const stops = useMemo(() => buildOrderedStopQueries(route), [route]);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const fallbackUrl = useMemo(() => buildGoogleMapsDirectionsUrl(stops), [stops]);

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-600 dark:bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-600 dark:text-zinc-200 dark:hover:text-zinc-400"
      >
        {open ? "地図を閉じる" : "地図でルートを表示"}{" "}
        <span className="font-normal text-zinc-500">（車のルート）</span>
      </button>

      {open && apiKey ? (
        <TripRouteMapInner route={route} apiKey={apiKey} />
      ) : null}

      {open && !apiKey ? (
        <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            アプリ内の地図を使うには、プロジェクト直下の{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-700">
              .env.local
            </code>{" "}
            に{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-700">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            を設定してください。Google Cloud で{" "}
            <span className="font-semibold">Maps JavaScript API</span> と{" "}
            <span className="font-semibold">Directions API</span> を有効にし、キーに適切な制限をかけてください。
          </p>
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
              （キーなしでもナビのたたき台として利用できます）
            </p>
          ) : (
            <p className="text-amber-800 dark:text-amber-200">
              経由地・目的地の名称または住所を登録すると、外部の Google
              マップへリンクできます。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
