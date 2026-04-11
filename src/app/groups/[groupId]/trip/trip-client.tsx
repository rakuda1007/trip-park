"use client";

import { useAuth } from "@/contexts/auth-context";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import {
  addTripRoute,
  deleteTripRoute,
  listTripRoutes,
  updateTripRoute,
  type TripRouteInput,
} from "@/lib/firestore/trip";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { TripRouteDoc, TripWaypoint } from "@/types/trip";
import { Timestamp } from "firebase/firestore";
import { TripRouteMapPanel } from "@/components/trip/trip-route-map-panel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type WaypointDraft = { name: string; memo: string; mapUrl: string };

function emptyDrafts(): WaypointDraft[] {
  return [];
}

function toDrafts(waypoints: TripWaypoint[]): WaypointDraft[] {
  return waypoints.map((w) => ({
    name: w.name,
    memo: typeof w.memo === "string" ? w.memo : "",
    mapUrl: typeof w.mapUrl === "string" ? w.mapUrl : "",
  }));
}

function draftsToWaypoints(drafts: WaypointDraft[]): TripWaypoint[] {
  return drafts
    .map((d) => ({
      name: d.name.trim(),
      memo: d.memo.trim() || null,
      mapUrl: d.mapUrl.trim() || null,
    }))
    .filter((w) => w.name.length > 0);
}

function formatTs(v: unknown): string {
  if (!v) return "—";
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "—";
}

function canManageTrip(
  group: GroupDoc,
  members: { userId: string; data: MemberDoc }[],
  uid: string,
  createdByUserId: string,
): boolean {
  if (group.ownerId === uid) return true;
  const m = members.find((x) => x.userId === uid);
  if (m?.data.role === "admin") return true;
  return uid === createdByUserId;
}

function MapLink({ href, label }: { href: string; label: string }) {
  const u = href.trim();
  if (!u) return null;
  return (
    <a
      href={u}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
    >
      {label}
    </a>
  );
}

export function TripClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [routes, setRoutes] = useState<{ id: string; data: TripRouteDoc }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [newRouteLabel, setNewRouteLabel] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDestName, setNewDestName] = useState("");
  const [newDestAddress, setNewDestAddress] = useState("");
  const [newDestMemo, setNewDestMemo] = useState("");
  const [newDestMapUrl, setNewDestMapUrl] = useState("");
  const [newRouteMapUrl, setNewRouteMapUrl] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("");
  const [newWaypoints, setNewWaypoints] = useState<WaypointDraft[]>(emptyDrafts());

  const [editRouteLabel, setEditRouteLabel] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDestName, setEditDestName] = useState("");
  const [editDestAddress, setEditDestAddress] = useState("");
  const [editDestMemo, setEditDestMemo] = useState("");
  const [editDestMapUrl, setEditDestMapUrl] = useState("");
  const [editRouteMapUrl, setEditRouteMapUrl] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");
  const [editWaypoints, setEditWaypoints] = useState<WaypointDraft[]>(emptyDrafts());

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const m = await listMembers(groupId);
        setMembers(m);
        const r = await listTripRoutes(groupId);
        setRoutes(r);
      } else {
        setMembers([]);
        setRoutes([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const nextSortOrder = useMemo(() => {
    if (routes.length === 0) return 0;
    return Math.max(...routes.map((x) => x.data.sortOrder)) + 1;
  }, [routes]);

  function startEdit(r: { id: string; data: TripRouteDoc }) {
    setEditingId(r.id);
    setEditRouteLabel(r.data.routeLabel ?? "");
    setEditTitle(r.data.title);
    setEditDestName(r.data.destinationName);
    setEditDestAddress(r.data.destinationAddress ?? "");
    setEditDestMemo(r.data.destinationMemo ?? "");
    setEditDestMapUrl(r.data.destinationMapUrl ?? "");
    setEditRouteMapUrl(r.data.routeMapUrl ?? "");
    setEditSortOrder(String(r.data.sortOrder));
    setEditWaypoints(
      r.data.waypoints?.length ? toDrafts(r.data.waypoints) : emptyDrafts(),
    );
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupId) return;
    const title = newTitle.trim();
    const dest = newDestName.trim();
    if (!title || !dest) {
      setError("見出しと目的地名は必須です。");
      return;
    }
    let sort = nextSortOrder;
    if (newSortOrder.trim() !== "") {
      const n = Number(newSortOrder);
      if (!Number.isFinite(n)) {
        setError("表示順は数値で入力してください。");
        return;
      }
      sort = Math.floor(n);
    }
    const input: TripRouteInput = {
      routeLabel: newRouteLabel.trim() || null,
      title,
      destinationName: dest,
      destinationAddress: newDestAddress.trim() || null,
      destinationMemo: newDestMemo.trim() || null,
      destinationMapUrl: newDestMapUrl.trim() || null,
      waypoints: draftsToWaypoints(newWaypoints),
      routeMapUrl: newRouteMapUrl.trim() || null,
      sortOrder: sort,
    };
    setBusy("add");
    setError(null);
    try {
      await addTripRoute(
        groupId,
        user.uid,
        user.displayName ?? null,
        input,
      );
      setNewRouteLabel("");
      setNewTitle("");
      setNewDestName("");
      setNewDestAddress("");
      setNewDestMemo("");
      setNewDestMapUrl("");
      setNewRouteMapUrl("");
      setNewSortOrder("");
      setNewWaypoints(emptyDrafts());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveEdit(routeId: string) {
    if (!user || !groupId) return;
    const title = editTitle.trim();
    const dest = editDestName.trim();
    if (!title || !dest) {
      setError("見出しと目的地名は必須です。");
      return;
    }
    const n = Number(editSortOrder);
    if (!Number.isFinite(n)) {
      setError("表示順は数値で入力してください。");
      return;
    }
    const input: TripRouteInput = {
      routeLabel: editRouteLabel.trim() || null,
      title,
      destinationName: dest,
      destinationAddress: editDestAddress.trim() || null,
      destinationMemo: editDestMemo.trim() || null,
      destinationMapUrl: editDestMapUrl.trim() || null,
      waypoints: draftsToWaypoints(editWaypoints),
      routeMapUrl: editRouteMapUrl.trim() || null,
      sortOrder: Math.floor(n),
    };
    setBusy(`edit-${routeId}`);
    setError(null);
    try {
      await updateTripRoute(groupId, routeId, input);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(routeId: string) {
    if (!groupId) return;
    if (!confirm("この旅程ブロックを削除しますか？")) return;
    setBusy(`del-${routeId}`);
    setError(null);
    try {
      await deleteTripRoute(groupId, routeId);
      if (editingId === routeId) setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

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
        <Link href="/groups" className="mt-4 inline-block text-sm text-zinc-900 underline">
          グループ一覧へ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← グループ詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        目的地・旅程
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        目的地・経由地・地図リンクをメンバー全員で共有します。複数ルートがある場合はラベル（例:
        A車）を付けて区別できます。
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          旅程ブロックを追加
        </h2>
        <form onSubmit={handleAdd} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              ルートラベル（任意）
              <input
                type="text"
                value={newRouteLabel}
                onChange={(e) => setNewRouteLabel(e.target.value)}
                placeholder="例: A車・行き"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              表示順（空欄なら末尾）
              <input
                type="text"
                inputMode="numeric"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(e.target.value)}
                placeholder={String(nextSortOrder)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            見出し <span className="text-red-600">*</span>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: Day1 キャンプ場へ"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            目的地の名称 <span className="text-red-600">*</span>
            <input
              type="text"
              required
              value={newDestName}
              onChange={(e) => setNewDestName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            住所・位置のメモ
            <input
              type="text"
              value={newDestAddress}
              onChange={(e) => setNewDestAddress(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            メモ（チェックイン時間・URL など）
            <textarea
              value={newDestMemo}
              onChange={(e) => setNewDestMemo(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            目的地の地図リンク（Google Maps など）
            <input
              type="url"
              value={newDestMapUrl}
              onChange={(e) => setNewDestMapUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            全体のルート地図リンク（任意）
            <input
              type="url"
              value={newRouteMapUrl}
              onChange={(e) => setNewRouteMapUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>

          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              経由地（上から順に移動順）
            </p>
            <ul className="mt-2 space-y-2">
              {newWaypoints.map((w, i) => (
                <li
                  key={i}
                  className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900/40"
                >
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={w.name}
                      onChange={(e) => {
                        const next = [...newWaypoints];
                        next[i] = { ...next[i]!, name: e.target.value };
                        setNewWaypoints(next);
                      }}
                      placeholder="経由地名"
                      className="min-w-[8rem] flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewWaypoints(newWaypoints.filter((_, j) => j !== i))
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      削除
                    </button>
                  </div>
                  <input
                    type="text"
                    value={w.memo}
                    onChange={(e) => {
                      const next = [...newWaypoints];
                      next[i] = { ...next[i]!, memo: e.target.value };
                      setNewWaypoints(next);
                    }}
                    placeholder="メモ（任意）"
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                  />
                  <input
                    type="url"
                    value={w.mapUrl}
                    onChange={(e) => {
                      const next = [...newWaypoints];
                      next[i] = { ...next[i]!, mapUrl: e.target.value };
                      setNewWaypoints(next);
                    }}
                    placeholder="地図リンク（任意）"
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() =>
                setNewWaypoints([...newWaypoints, { name: "", memo: "", mapUrl: "" }])
              }
              className="mt-2 text-xs text-zinc-700 underline dark:text-zinc-300"
            >
              + 経由地を追加
            </button>
          </div>

          <button
            type="submit"
            disabled={busy !== null || !user}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {busy === "add" ? "保存中…" : "追加する"}
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          登録済みの旅程
        </h2>
        {routes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            まだ旅程がありません。上のフォームから追加してください。
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {routes.map((r) => {
              const can = user
                ? canManageTrip(group, members, user.uid, r.data.createdByUserId)
                : false;
              const isEditing = editingId === r.id;

              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                          ルートラベル
                          <input
                            type="text"
                            value={editRouteLabel}
                            onChange={(e) => setEditRouteLabel(e.target.value)}
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                          />
                        </label>
                        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                          表示順
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editSortOrder}
                            onChange={(e) => setEditSortOrder(e.target.value)}
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                          />
                        </label>
                      </div>
                      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                        見出し
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                        目的地の名称
                        <input
                          type="text"
                          value={editDestName}
                          onChange={(e) => setEditDestName(e.target.value)}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                        住所・位置のメモ
                        <input
                          type="text"
                          value={editDestAddress}
                          onChange={(e) => setEditDestAddress(e.target.value)}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                        メモ
                        <textarea
                          value={editDestMemo}
                          onChange={(e) => setEditDestMemo(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                        目的地の地図リンク
                        <input
                          type="url"
                          value={editDestMapUrl}
                          onChange={(e) => setEditDestMapUrl(e.target.value)}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                        全体のルート地図リンク
                        <input
                          type="url"
                          value={editRouteMapUrl}
                          onChange={(e) => setEditRouteMapUrl(e.target.value)}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                      <div>
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          経由地
                        </p>
                        <ul className="mt-2 space-y-2">
                          {editWaypoints.map((w, i) => (
                            <li
                              key={i}
                              className="rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-600 dark:bg-zinc-900/60"
                            >
                              <div className="flex flex-wrap gap-2">
                                <input
                                  type="text"
                                  value={w.name}
                                  onChange={(e) => {
                                    const next = [...editWaypoints];
                                    next[i] = { ...next[i]!, name: e.target.value };
                                    setEditWaypoints(next);
                                  }}
                                  className="min-w-[8rem] flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditWaypoints(
                                      editWaypoints.filter((_, j) => j !== i),
                                    )
                                  }
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  削除
                                </button>
                              </div>
                              <input
                                type="text"
                                value={w.memo}
                                onChange={(e) => {
                                  const next = [...editWaypoints];
                                  next[i] = { ...next[i]!, memo: e.target.value };
                                  setEditWaypoints(next);
                                }}
                                placeholder="メモ"
                                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                              />
                              <input
                                type="url"
                                value={w.mapUrl}
                                onChange={(e) => {
                                  const next = [...editWaypoints];
                                  next[i] = { ...next[i]!, mapUrl: e.target.value };
                                  setEditWaypoints(next);
                                }}
                                placeholder="地図リンク"
                                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                              />
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() =>
                            setEditWaypoints([
                              ...editWaypoints,
                              { name: "", memo: "", mapUrl: "" },
                            ])
                          }
                          className="mt-2 text-xs text-zinc-700 underline dark:text-zinc-300"
                        >
                          + 経由地を追加
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(r.id)}
                          disabled={busy !== null}
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          {busy === `edit-${r.id}` ? "保存中…" : "保存"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={busy !== null}
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          {r.data.routeLabel ? (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                              {r.data.routeLabel}
                            </span>
                          ) : null}
                          <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                            {r.data.title}
                          </h3>
                        </div>
                        {can ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              disabled={busy !== null}
                              className="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              disabled={busy !== null}
                              className="text-xs text-red-600 hover:underline"
                            >
                              削除
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          目的地:{" "}
                        </span>
                        {r.data.destinationName}
                      </p>
                      {r.data.destinationAddress ? (
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {r.data.destinationAddress}
                        </p>
                      ) : null}
                      {r.data.destinationMemo ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                          {r.data.destinationMemo}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        <MapLink href={r.data.destinationMapUrl ?? ""} label="目的地を地図で開く" />
                        <MapLink href={r.data.routeMapUrl ?? ""} label="ルート全体を地図で開く" />
                      </div>
                      {r.data.waypoints && r.data.waypoints.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-zinc-500">
                            経由地（順路順）
                          </p>
                          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                            {r.data.waypoints.map((w, wi) => (
                              <li key={wi}>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                  {w.name}
                                </span>
                                {w.memo ? (
                                  <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                                    {w.memo}
                                  </span>
                                ) : null}
                                {w.mapUrl ? (
                                  <span className="ml-2">
                                    <MapLink href={w.mapUrl} label="地図" />
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                      <TripRouteMapPanel route={r.data} />
                      <p className="mt-3 text-xs text-zinc-500">
                        登録: {formatTs(r.data.createdAt)} ·{" "}
                        {r.data.createdByDisplayName || r.data.createdByUserId.slice(0, 8) + "…"}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
