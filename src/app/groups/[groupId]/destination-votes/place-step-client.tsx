"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  getGroup,
  getMemberForUser,
  updatePlaceFixed,
  updatePlaceMode,
} from "@/lib/firestore/groups";
import { isMainPlaceRegistered } from "@/lib/place-vote-copy";
import { resolvePlanConfig } from "@/lib/plan-shape";
import type { GroupDoc, PlaceMode } from "@/types/group";
import { VisibilityBadge } from "@/components/visibility-badge";
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
  /** 拠点登録済み時の編集トグル（未登録時は常にフォーム） */
  const [editingFixed, setEditingFixed] = useState(false);

  const [fixedName, setFixedName] = useState("");
  const [fixedMapUrl, setFixedMapUrl] = useState("");
  const [fixedNote, setFixedNote] = useState("");

  const syncFixedFields = useCallback((g: GroupDoc) => {
    setFixedName(g.placeFixed?.name?.trim() || g.destination?.trim() || "");
    setFixedMapUrl(g.placeFixed?.mapUrl?.trim() || "");
    setFixedNote(g.placeFixed?.note?.trim() || "");
  }, []);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        syncFixedFields(g);
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
  }, [groupId, user, syncFixedFields]);

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
  const hubRegistered = isMainPlaceRegistered(group);
  const hubName =
    group.placeFixed?.name?.trim() || group.destination?.trim() || "";
  const hubMapUrl = group.placeFixed?.mapUrl?.trim() || "";
  const hubNote = group.placeFixed?.note?.trim() || "";

  async function handleModeChange(next: PlaceMode) {
    if (!canManage || !groupId) return;
    setBusy(true);
    setError(null);
    try {
      await updatePlaceMode(groupId, next);
      setEditingFixed(false);
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
      setError(`主な${placeLabel}名を入力してください。`);
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
      setEditingFixed(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function handleCancelEdit() {
    if (!group) return;
    syncFixedFields(group);
    setEditingFixed(false);
    setError(null);
  }

  function handleStartEdit() {
    if (!group) return;
    syncFixedFields(group);
    setEditingFixed(true);
    setError(null);
  }

  const modeSwitcher =
    canManage && config.place !== "off" ? (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            主な{placeLabel}の決め方
          </p>
          <VisibilityBadge kind="admin" />
        </div>
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

  const fixedForm = (
    <form onSubmit={handleSaveFixed} className="max-w-md space-y-3">
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {hubRegistered ? `主な${placeLabel}を変更` : `主な${placeLabel}を登録`}
          </p>
          <VisibilityBadge kind="admin" />
        </div>
      ) : null}
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        主な{placeLabel}名 <span className="text-red-500">*</span>
        <input
          type="text"
          required
          value={fixedName}
          onChange={(e) => setFixedName(e.target.value)}
          disabled={!canManage || busy}
          placeholder={
            config.planShape === "gathering"
              ? "例: 〇〇居酒屋 駅前店"
              : "例: 修善寺・箱根"
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
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "保存中…" : "保存する"}
          </button>
          {hubRegistered && editingFixed ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleCancelEdit}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          登録・変更はオーナーまたは管理者のみ行えます。
        </p>
      )}
    </form>
  );

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
        {modeSwitcher ? <div className="mt-4">{modeSwitcher}</div> : null}
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
    const showForm = !hubRegistered || editingFixed;

    return (
      <div>
        <div
          className={
            hubRegistered
              ? "mx-auto w-full max-w-3xl px-4 pt-4 pb-2"
              : "mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14"
          }
        >
          {hubRegistered ? (
            <>
              {modeSwitcher ? <div className="mb-3">{modeSwitcher}</div> : null}
              {error ? (
                <p className="mb-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {!showForm ? (
                <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
                      主な{placeLabel}（確定）
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {hubName}
                      {hubMapUrl ? (
                        <>
                          {" · "}
                          <a
                            href={hubMapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-normal underline"
                          >
                            地図
                          </a>
                        </>
                      ) : null}
                    </p>
                    {hubNote ? (
                      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {hubNote}
                      </p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <VisibilityBadge kind="admin" />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleStartEdit}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        変更
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-1">{fixedForm}</div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                主な{placeLabel}
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                拠点が決まっているときはこちらで登録します。登録後、途中で寄る場所は「立ち寄りの投票」で決められます。
              </p>
              {error ? (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {modeSwitcher ? <div className="mt-4">{modeSwitcher}</div> : null}
              <div className="mt-6">{fixedForm}</div>
            </>
          )}
        </div>
        {hubRegistered ? (
          <div className="border-t border-zinc-200 dark:border-zinc-700">
            <DestinationVotesClient
              placeVoteKind="stopover"
              embedded
              hideHubSummary
            />
          </div>
        ) : null}
      </div>
    );
  }

  // vote — 拠点未定なら目的地投票、確定後は立ち寄り表記に自動切替
  return (
    <div>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {modeSwitcher ? <div className="mt-2">{modeSwitcher}</div> : null}
      </div>
      <DestinationVotesClient />
    </div>
  );
}
