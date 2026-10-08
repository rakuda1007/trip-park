"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  getGroup,
  getMemberForUser,
  updatePlaceFixed,
  updatePlaceMode,
} from "@/lib/firestore/groups";
import { resolvePlanConfig } from "@/lib/plan-shape";
import type { GroupDoc, PlaceMode } from "@/types/group";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DestinationVotesClient } from "./destination-votes-client";

export function PlaceStepClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fixedName, setFixedName] = useState("");
  const [fixedMapUrl, setFixedMapUrl] = useState("");
  const [fixedNote, setFixedNote] = useState("");

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        setFixedName(g.placeFixed?.name?.trim() || g.destination?.trim() || "");
        setFixedMapUrl(g.placeFixed?.mapUrl?.trim() || "");
        setFixedNote(g.placeFixed?.note?.trim() || "");
      }
      if (g && user) {
        const m = await getMemberForUser(groupId, user.uid).catch(() => null);
        setCanManage(
          user.uid === g.ownerId || m?.role === "admin" || m?.role === "owner",
        );
      } else {
        setCanManage(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId, user]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <p className="text-sm text-zinc-600">旅行が見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm underline">
          旅行一覧へ
        </Link>
      </div>
    );
  }

  const config = resolvePlanConfig(group);
  const placeLabel = config.labels.place;

  async function handleModeChange(next: PlaceMode) {
    if (!canManage || !groupId) return;
    setBusy(true);
    setError(null);
    try {
      await updatePlaceMode(groupId, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveFixed(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !groupId) return;
    const name = fixedName.trim();
    if (!name) {
      setError(`${placeLabel}名を入力してください。`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePlaceFixed(groupId, {
        name,
        mapUrl: fixedMapUrl.trim() || null,
        note: fixedNote.trim() || null,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const modeSwitcher =
    canManage && config.place !== "off" ? (
      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {placeLabel}の決め方
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { value: "vote" as const, label: "投票で決める" },
              { value: "fixed" as const, label: "決まっているので登録" },
              { value: "skip" as const, label: "この予定では使わない" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={busy || config.placeMode === opt.value}
              onClick={() => void handleModeChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                config.placeMode === opt.value
                  ? "bg-teal-700 text-white dark:bg-teal-600"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  if (config.place === "off" || config.placeMode === "skip") {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {placeLabel}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          この予定では{placeLabel}の調整は使いません。精算や連絡はそのまま使えます。
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {modeSwitcher}
        <Link
          href={`/groups/${groupId}`}
          className="mt-6 inline-block text-sm text-zinc-800 underline dark:text-zinc-200"
        >
          ホームへ戻る
        </Link>
      </div>
    );
  }

  if (config.placeMode === "fixed") {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {placeLabel}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          投票なしで、決まっている{placeLabel}を登録します。
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {modeSwitcher}
        <form onSubmit={handleSaveFixed} className="mt-6 max-w-md space-y-3">
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            {placeLabel}名 <span className="text-red-500">*</span>
            <input
              type="text"
              required
              value={fixedName}
              onChange={(e) => setFixedName(e.target.value)}
              disabled={!canManage || busy}
              placeholder={
                config.planShape === "gathering"
                  ? "例: 〇〇居酒屋 駅前店"
                  : "例: 箱根・強羅"
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            地図・予約 URL（任意）
            <input
              type="url"
              value={fixedMapUrl}
              onChange={(e) => setFixedMapUrl(e.target.value)}
              disabled={!canManage || busy}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            メモ（任意）
            <input
              type="text"
              value={fixedNote}
              onChange={(e) => setFixedNote(e.target.value)}
              disabled={!canManage || busy}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          {canManage ? (
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? "保存中…" : "保存する"}
            </button>
          ) : (
            <p className="text-xs text-zinc-500">
              登録・変更はオーナーまたは管理者のみ行えます。
            </p>
          )}
        </form>
        {group.destination ? (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            現在の登録:{" "}
            <span className="font-medium">{group.destination}</span>
            {group.placeFixed?.mapUrl ? (
              <>
                {" · "}
                <a
                  href={group.placeFixed.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  地図を開く
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }

  // vote
  return (
    <div>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {modeSwitcher}
      </div>
      <DestinationVotesClient />
    </div>
  );
}
