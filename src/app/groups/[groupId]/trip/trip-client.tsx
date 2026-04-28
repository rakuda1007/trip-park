"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import { listBulletinTopics } from "@/lib/firestore/bulletin";
import { getGroup } from "@/lib/firestore/groups";
import {
  addTripRoute,
  deleteTripRoute,
  listTripRoutes,
  updateDayDone,
  updateTripRoute,
  type TripRouteInput,
} from "@/lib/firestore/trip";
import { collectMealsForDayFromBulletin } from "@/lib/recipe-vote";
import { calcTripNumDays, dateLabelForTripDay } from "@/lib/trip-dates";
import { RECIPE_MEAL_LABELS } from "@/types/bulletin";
import type { GroupDoc } from "@/types/group";
import type { TripRouteDoc, TripWaypoint } from "@/types/trip";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function initialSegmentDrafts(initial?: Partial<TripRouteDoc>): string[] {
  const wp = initial?.waypoints?.length ?? 0;
  if (wp === 0) return [];
  const len = wp + 1;
  const raw = initial?.segmentRouteMapUrls;
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: len }, (_, i) => {
    const v = arr[i];
    return typeof v === "string" ? v : "";
  });
}

function segmentUrlsFromDrafts(
  drafts: string[],
  waypointCount: number,
): (string | null)[] {
  if (waypointCount === 0) return [];
  const len = waypointCount + 1;
  const out: (string | null)[] = [];
  for (let i = 0; i < len; i++) {
    const s = (drafts[i] ?? "").trim();
    out.push(s.length ? s : null);
  }
  return out;
}

/** 表示用: 区間 i のラベル（経由地が n 件のとき i は 0..n） */
function segmentRouteLabelForRoute(i: number, route: TripRouteDoc): string {
  const w = route.waypoints;
  const n = w.length;
  if (n === 0) return "";
  const dep = route.departurePoint?.trim() || "出発地";
  if (i === 0) return `${dep} → ${w[0]!.name}`;
  if (i < n) return `${w[i - 1]!.name} → ${w[i]!.name}`;
  return `${w[n - 1]!.name} → ${route.destinationName}`;
}

// ────────────────────────────────
// ユーティリティ
// ────────────────────────────────

type WaypointDraft = { name: string; memo: string; mapUrl: string };

/** フォーム用: 下書きの経由地名で区間ラベル */
function segmentRouteLabelDraft(
  i: number,
  waypointCount: number,
  departureDraft: string,
  waypointDrafts: WaypointDraft[],
  destinationDraft: string,
): string {
  const dep = departureDraft.trim() || "出発地";
  if (waypointCount === 0) return "";
  if (i === 0) {
    const to = waypointDrafts[0]?.name.trim() || "経由地1";
    return `${dep} → ${to}`;
  }
  if (i < waypointCount) {
    const a = waypointDrafts[i - 1]?.name.trim() || `経由地${i}`;
    const b = waypointDrafts[i]?.name.trim() || `経由地${i + 1}`;
    return `${a} → ${b}`;
  }
  const last = waypointDrafts[waypointCount - 1]?.name.trim() || `経由地${waypointCount}`;
  const dest = destinationDraft.trim() || "目的地";
  return `${last} → ${dest}`;
}

function emptyDrafts(): WaypointDraft[] { return []; }
function toDrafts(wp: TripWaypoint[]): WaypointDraft[] {
  return wp.map((w) => ({ name: w.name, memo: w.memo ?? "", mapUrl: w.mapUrl ?? "" }));
}
function fromDrafts(drafts: WaypointDraft[]): TripWaypoint[] {
  return drafts
    .map((d) => ({ name: d.name.trim(), memo: d.memo.trim() || null, mapUrl: d.mapUrl.trim() || null }))
    .filter((w) => w.name.length > 0);
}

// ────────────────────────────────
// Waypoint フォーム部品
// ────────────────────────────────

function WaypointEditor({
  waypoints,
  onChange,
  departureDraft,
  destinationDraft,
  segmentRouteMapUrls,
  onSegmentRouteMapUrlsChange,
}: {
  waypoints: WaypointDraft[];
  onChange: (next: WaypointDraft[]) => void;
  departureDraft: string;
  destinationDraft: string;
  segmentRouteMapUrls: string[];
  onSegmentRouteMapUrlsChange: (next: string[]) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">経由地（順路順）</p>
      {waypoints.length > 0 && (
        <ul className="mt-2 space-y-2">
          {waypoints.map((w, i) => (
            <li key={i} className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900/40">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={w.name}
                  onChange={(e) => { const n = [...waypoints]; n[i] = { ...n[i]!, name: e.target.value }; onChange(n); }}
                  placeholder="経由地名"
                  className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
                <button type="button" onClick={() => onChange(waypoints.filter((_, j) => j !== i))}
                  className="text-xs text-red-500 hover:underline">削除</button>
              </div>
              <input type="text" value={w.memo}
                onChange={(e) => { const n = [...waypoints]; n[i] = { ...n[i]!, memo: e.target.value }; onChange(n); }}
                placeholder="メモ（任意）"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900" />
              <input type="url" value={w.mapUrl}
                onChange={(e) => { const n = [...waypoints]; n[i] = { ...n[i]!, mapUrl: e.target.value }; onChange(n); }}
                placeholder="地図リンク（任意）"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900" />
            </li>
          ))}
        </ul>
      )}
      {waypoints.length > 0 && segmentRouteMapUrls.length === waypoints.length + 1 && (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-600 dark:bg-zinc-900/30">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">区間ごとのルート地図（任意）</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            出発地から最初の経由地、経由地同士、最後の経由地から目的地まで、区間ごとに別のナビ・ルートURLを登録できます。
          </p>
          <ul className="mt-2 space-y-2">
            {segmentRouteMapUrls.map((url, i) => (
              <li key={i}>
                <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span className="mb-0.5 block font-medium text-zinc-700 dark:text-zinc-300">
                    {segmentRouteLabelDraft(i, waypoints.length, departureDraft, waypoints, destinationDraft)}
                  </span>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const n = [...segmentRouteMapUrls];
                      n[i] = e.target.value;
                      onSegmentRouteMapUrlsChange(n);
                    }}
                    placeholder="https://maps.google.com/..."
                    className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button"
        onClick={() => onChange([...waypoints, { name: "", memo: "", mapUrl: "" }])}
        className="mt-2 text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        ＋ 経由地を追加
      </button>
    </div>
  );
}

// ────────────────────────────────
// Day 編集フォーム
// ────────────────────────────────

function DayForm({
  dayNumber,
  initial,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  dayNumber: number;
  initial?: Partial<TripRouteDoc>;
  onSubmit: (input: TripRouteInput) => void;
  onCancel?: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const [departure, setDeparture] = useState(initial?.departurePoint ?? "");
  const [departureMeetTime, setDepartureMeetTime] = useState(
    initial?.departureMeetTime ?? "",
  );
  const [departureMapUrl, setDepartureMapUrl] = useState(initial?.departureMapUrl ?? "");
  const [destName, setDestName] = useState(initial?.destinationName ?? "");
  const [destMapUrl, setDestMapUrl] = useState(initial?.destinationMapUrl ?? "");
  const [waypoints, setWaypoints] = useState<WaypointDraft[]>(
    initial?.waypoints ? toDrafts(initial.waypoints) : emptyDrafts(),
  );
  const [segmentRouteMapUrls, setSegmentRouteMapUrls] = useState<string[]>(() =>
    initialSegmentDrafts(initial),
  );
  const [routeMapUrl, setRouteMapUrl] = useState(initial?.routeMapUrl ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");

  useEffect(() => {
    const n = waypoints.length;
    if (n === 0) {
      setSegmentRouteMapUrls([]);
      return;
    }
    const targetLen = n + 1;
    setSegmentRouteMapUrls((prev) => {
      if (prev.length === targetLen) return prev;
      const next = prev.slice(0, targetLen);
      while (next.length < targetLen) next.push("");
      return next;
    });
  }, [waypoints.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destName.trim()) return;
    const wp = fromDrafts(waypoints);
    onSubmit({
      dayNumber,
      departurePoint: departure.trim() || null,
      departureMeetTime: departureMeetTime.trim() || null,
      departureMapUrl: departureMapUrl.trim() || null,
      destinationName: destName.trim(),
      destinationMapUrl: destMapUrl.trim() || null,
      waypoints: wp,
      segmentRouteMapUrls: segmentUrlsFromDrafts(segmentRouteMapUrls, wp.length),
      routeMapUrl: routeMapUrl.trim() || null,
      memo: memo.trim() || null,
      isDone: initial?.isDone ?? false,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        出発地（任意）
        <input type="text" value={departure} onChange={(e) => setDeparture(e.target.value)}
          placeholder="例: 自宅・東京駅"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        待ち合わせ・出発の目安時間（任意）
        <input type="text" value={departureMeetTime} onChange={(e) => setDepartureMeetTime(e.target.value)}
          placeholder="例: 8:30、9:00頃"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        出発地の地図リンク（任意）
        <input type="url" value={departureMapUrl} onChange={(e) => setDepartureMapUrl(e.target.value)}
          placeholder="https://maps.google.com/..."
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        目的地 <span className="text-red-500">*</span>
        <input required type="text" value={destName} onChange={(e) => setDestName(e.target.value)}
          placeholder="例: 九十九里シーサイドキャンプ場"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        目的地の地図リンク（任意）
        <input type="url" value={destMapUrl} onChange={(e) => setDestMapUrl(e.target.value)}
          placeholder="https://maps.google.com/..."
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <WaypointEditor
        waypoints={waypoints}
        onChange={setWaypoints}
        departureDraft={departure}
        destinationDraft={destName}
        segmentRouteMapUrls={segmentRouteMapUrls}
        onSegmentRouteMapUrlsChange={setSegmentRouteMapUrls}
      />
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        全体のルート地図リンク（任意）
        <input type="url" value={routeMapUrl} onChange={(e) => setRouteMapUrl(e.target.value)}
          placeholder="https://maps.google.com/..."
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        メモ（任意）
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2}
          placeholder="チェックイン時間・持ち物など"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !destName.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {busy ? "保存中…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600">
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}

// ────────────────────────────────
// Day カード（表示モード）
// ────────────────────────────────

function DayCard({
  route,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onToggleDone,
}: {
  route: TripRouteDoc;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* 出発地・待ち合わせ */}
      {(route.departurePoint || route.departureMeetTime) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">出発地</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {route.departurePoint ? (
              <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{route.departurePoint}</span>
            ) : null}
            {route.departureMeetTime ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                待ち合わせ {route.departureMeetTime}
              </span>
            ) : null}
            {route.departureMapUrl && (
              <a href={route.departureMapUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .953.524l.004.002.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
                </svg>
                地図
              </a>
            )}
          </div>
        </div>
      )}

      {/* 目的地 */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">目的地</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{route.destinationName}</span>
          {route.destinationMapUrl && (
            <a href={route.destinationMapUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .953.524l.004.002.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
              </svg>
              地図
            </a>
          )}
        </div>
      </div>

      {/* 経由地 */}
      {route.waypoints && route.waypoints.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">経由地</p>
          <ol className="mt-1 space-y-1.5 pl-1">
            {route.waypoints.map((w, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">
                  {i + 1}
                </span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{w.name}</span>
                {w.memo && <span className="text-zinc-500">{w.memo}</span>}
                {w.mapUrl && (
                  <a href={w.mapUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400">
                    地図
                  </a>
                )}
              </li>
            ))}
          </ol>
          {(route.segmentRouteMapUrls ?? []).some((u) => u) && (
            <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                区間のルート
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {(route.segmentRouteMapUrls ?? []).map((url, i) =>
                  url ? (
                    <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {segmentRouteLabelForRoute(i, route)}
                      </span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                      >
                        ルートを開く
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ルート地図リンク */}
      {route.routeMapUrl && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">全体のルート</p>
          <a href={route.routeMapUrl} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            ルートを地図で開く
          </a>
        </div>
      )}

      {/* メモ */}
      {route.memo && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">メモ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{route.memo}</p>
        </div>
      )}

      {/* アクション */}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {/* Day完了チェック */}
        <button type="button" onClick={onToggleDone} disabled={busy}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
            route.isDone
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          }`}>
          {route.isDone ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              完了済み
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                <path fillRule="evenodd" d="M1.38 8a6.62 6.62 0 1 1 13.24 0A6.62 6.62 0 0 1 1.38 8ZM8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Z" clipRule="evenodd" />
              </svg>
              完了にする
            </>
          )}
        </button>

        {canEdit && (
          <>
            <button type="button" onClick={onEdit} disabled={busy}
              className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400">
              編集
            </button>
            <button type="button" onClick={onDelete} disabled={busy}
              className="text-xs text-red-600 hover:underline disabled:opacity-50">
              削除
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────
// メインコンポーネント
// ────────────────────────────────

export function TripClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [routes, setRoutes] = useState<{ id: string; data: TripRouteDoc }[]>([]);
  const [bulletinTopics, setBulletinTopics] = useState<
    Awaited<ReturnType<typeof listBulletinTopics>>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const r = await listTripRoutes(groupId);
        setRoutes(r);
        // 初期表示: 最初の未完了 Day をデフォルト選択
        const firstIncomplete = r.find((x) => !x.data.isDone);
        if (firstIncomplete) setSelectedDay(firstIncomplete.data.dayNumber);
        else if (r.length > 0) setSelectedDay(r[r.length - 1]!.data.dayNumber);
        try {
          setBulletinTopics(await listBulletinTopics(groupId));
        } catch {
          setBulletinTopics([]);
        }
      } else {
        setBulletinTopics([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
      setBulletinTopics([]);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  // Day数 = 旅程日数 OR 登録済み最大Day + 1（余裕）
  const numDays = useMemo(() => {
    const fromDates = calcTripNumDays(
      group?.tripStartDate ?? null,
      group?.tripEndDate ?? null,
    );
    const maxRoute = routes.reduce((m, r) => Math.max(m, r.data.dayNumber), 0);
    return Math.max(fromDates, maxRoute, 1);
  }, [group, routes]);

  const mealsForSelectedDay = useMemo(
    () => collectMealsForDayFromBulletin(selectedDay, bulletinTopics),
    [selectedDay, bulletinTopics],
  );

  const dayNumbers = useMemo(() => Array.from({ length: numDays }, (_, i) => i + 1), [numDays]);

  const currentRoute = useMemo(
    () => routes.find((r) => r.data.dayNumber === selectedDay) ?? null,
    [routes, selectedDay],
  );

  const isOwnerOrAdmin = useMemo(() => {
    if (!user || !group) return false;
    return group.ownerId === user.uid;
  }, [user, group]);

  // Day追加（+1日）
  async function handleAddDay() {
    const newDay = numDays + 1;
    setSelectedDay(newDay);
    setShowAddForm(true);
  }

  async function handleAddRoute(input: TripRouteInput) {
    if (!user) return;
    setBusy("add");
    setError(null);
    try {
      await addTripRoute(groupId, user.uid, user.displayName ?? null, input);
      setShowAddForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateRoute(routeId: string, input: TripRouteInput) {
    setBusy(`edit-${routeId}`);
    setError(null);
    try {
      await updateTripRoute(groupId, routeId, input);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(routeId: string) {
    if (!confirm("この日のプランを削除しますか？")) return;
    setBusy(`del-${routeId}`);
    try {
      await deleteTripRoute(groupId, routeId);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleDone(routeId: string, current: boolean) {
    setBusy(`done-${routeId}`);
    try {
      await updateDayDone(groupId, routeId, !current);
      await load();
      // 完了にしたら次の未完日へ移動
      if (!current) {
        const nextIncomplete = routes.find((r) => r.id !== routeId && !r.data.isDone);
        if (nextIncomplete) setSelectedDay(nextIncomplete.data.dayNumber);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  // ────────────────────────────────
  // ローディング / エラー
  // ────────────────────────────────

  if (group === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }
  if (group === null) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">グループが見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm underline">グループ一覧へ</Link>
      </div>
    );
  }

  // ────────────────────────────────
  // レンダリング
  // ────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        ← 旅行詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">旅程</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        <Link
          href={`/groups/${groupId}`}
          className="font-medium text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          {group.name}
        </Link>
        {group.tripStartDate && (
          <span className="ml-2 text-zinc-400">
            {group.tripStartDate}{group.tripEndDate && group.tripEndDate !== group.tripStartDate ? ` 〜 ${group.tripEndDate}` : ""}
          </span>
        )}
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {/* Day タブ */}
      <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-1">
        {dayNumbers.map((day) => {
          const r = routes.find((x) => x.data.dayNumber === day);
          const done = r?.data.isDone ?? false;
          const hasData = !!r;
          return (
            <button key={day} type="button" onClick={() => { setSelectedDay(day); setShowAddForm(false); setEditingId(null); }}
              className={`relative flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-xs font-medium transition ${
                selectedDay === day
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : hasData
                      ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      : "border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/30"
              }`}>
              <span>Day {day}</span>
              {group.tripStartDate && (
                <span className={`text-[10px] ${selectedDay === day ? "text-zinc-300" : "text-zinc-400"}`}>
                  {dateLabelForTripDay(group.tripStartDate, day - 1)}
                </span>
              )}
              {done && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                    <path fillRule="evenodd" d="M10.293 2.293a1 1 0 0 1 0 1.414l-5.5 5.5a1 1 0 0 1-1.414 0l-2.5-2.5a1 1 0 1 1 1.414-1.414L4.5 7.086l4.793-4.793a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
        {/* + Day 追加ボタン */}
        <button type="button" onClick={handleAddDay}
          className="shrink-0 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-600">
          ＋
        </button>
      </div>

      {/* 選択中の Day コンテンツ */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Day {selectedDay}</h2>
          {group.tripStartDate && (
            <span className="text-sm text-zinc-400">
              {dateLabelForTripDay(group.tripStartDate, selectedDay - 1)}
            </span>
          )}
        </div>

        {mealsForSelectedDay.length > 0 ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/25">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
              この日の献立（レシピ投票の確定）
            </p>
            <ul className="mt-2 space-y-2">
              {mealsForSelectedDay.map((m, i) => (
                <li key={`${m.topicId}-${m.meal}-${i}`} className="text-sm text-zinc-800 dark:text-zinc-100">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">
                    {RECIPE_MEAL_LABELS[m.meal]}
                  </span>
                  {": "}
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-300">
                    {m.recipeTitle}
                  </a>
                  <span className="ml-1 text-xs text-zinc-500">
                    （{m.topicTitle}）
                  </span>
                  <Link
                    href={`/groups/${groupId}/bulletin/${m.topicId}`}
                    className="ml-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    話題へ
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {currentRoute === null ? (
          /* このDayのプランがない */
          showAddForm ? (
            <DayForm
              dayNumber={selectedDay}
              onSubmit={handleAddRoute}
              onCancel={() => setShowAddForm(false)}
              busy={busy === "add"}
              submitLabel="追加する"
            />
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">この日のプランはまだ登録されていません。</p>
              <button type="button" onClick={() => setShowAddForm(true)}
                className="mt-3 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200">
                ＋ プランを追加
              </button>
            </div>
          )
        ) : (
          /* このDayのプランがある */
          editingId === currentRoute.id ? (
            <DayForm
              dayNumber={selectedDay}
              initial={currentRoute.data}
              onSubmit={(input) => handleUpdateRoute(currentRoute.id, input)}
              onCancel={() => setEditingId(null)}
              busy={busy === `edit-${currentRoute.id}`}
              submitLabel="保存"
            />
          ) : (
            <DayCard
              route={currentRoute.data}
              canEdit={isOwnerOrAdmin || (!!user && currentRoute.data.createdByUserId === user.uid)}
              busy={busy !== null}
              onEdit={() => setEditingId(currentRoute.id)}
              onDelete={() => handleDelete(currentRoute.id)}
              onToggleDone={() => handleToggleDone(currentRoute.id, currentRoute.data.isDone)}
            />
          )
        )}
      </div>

      {/* 進捗サマリー */}
      {routes.length > 0 && (
        <p className="mt-3 text-right text-xs text-zinc-400">
          {routes.filter((r) => r.data.isDone).length} / {numDays} 日完了
        </p>
      )}
    </div>
  );
}
