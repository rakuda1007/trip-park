"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  addFamily,
  deleteFamily,
  listFamilies,
  updateFamily,
  type FamilyInput,
} from "@/lib/firestore/families";
import {
  listCircleMembers,
  listCircles,
  type CircleMemberItem,
} from "@/lib/firestore/circles";
import {
  buildWelcomeUrl,
  getGroup,
  listMembers,
} from "@/lib/firestore/groups";
import { listHouseholds, type HouseholdItem } from "@/lib/firestore/households";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { FamilyDoc } from "@/types/family";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function canManageFamily(
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

type FormState = {
  name: string;
  adultCount: string;
  childCount: string;
  childRatio: string;
  householdMasterId: string | null;
};

function emptyForm(): FormState {
  return {
    name: "",
    adultCount: "1",
    childCount: "0",
    childRatio: "0.5",
    householdMasterId: null,
  };
}

export function FamiliesClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isSetupMode =
    searchParams.get("setup") === "1" || searchParams.get("setup") === "true";
  const circleInviteId = searchParams.get("circleInvite");
  const afterSetup = searchParams.get("after");

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>([]);
  const [families, setFamilies] = useState<{ id: string; data: FamilyDoc }[]>([]);
  const [households, setHouseholds] = useState<HouseholdItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [circleInviteName, setCircleInviteName] = useState<string | null>(null);
  const [circleInviteMembers, setCircleInviteMembers] = useState<
    CircleMemberItem[]
  >([]);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHouseholdPicker, setShowHouseholdPicker] = useState(false);

  const memberIds = new Set(members.map((m) => m.userId));

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const [m, f] = await Promise.all([listMembers(groupId), listFamilies(groupId)]);
        setMembers(m);
        setFamilies(f);
      } else {
        setMembers([]);
        setFamilies([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    listHouseholds(user.uid)
      .then((list) => {
        setHouseholds(list);
        // セットアップ時はマスタがあればピッカーを開いてすぐ登録できるようにする
        if (isSetupMode && list.length > 0) {
          setShowHouseholdPicker(true);
        }
      })
      .catch(() => {});
  }, [user, isSetupMode]);

  useEffect(() => {
    if (!user || !circleInviteId) {
      setCircleInviteName(null);
      setCircleInviteMembers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [circles, membersList] = await Promise.all([
          listCircles(user.uid),
          listCircleMembers(circleInviteId),
        ]);
        if (cancelled) return;
        const c = circles.find((x) => x.id === circleInviteId);
        setCircleInviteName(c?.data.name ?? "選択したサークル");
        setCircleInviteMembers(membersList);
      } catch {
        if (!cancelled) {
          setCircleInviteName(null);
          setCircleInviteMembers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, circleInviteId]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowHouseholdPicker(false);
  }

  function applyHousehold(h: HouseholdItem) {
    setForm((prev) => ({
      ...prev,
      name: h.data.name,
      adultCount: String(h.data.defaultAdultCount),
      childCount: String(h.data.defaultChildCount),
      childRatio: String(h.data.defaultChildRatio),
      householdMasterId: h.id,
    }));
    setShowHouseholdPicker(false);
  }

  function startEdit(row: { id: string; data: FamilyDoc }) {
    setEditingId(row.id);
    setForm({
      name: row.data.name,
      adultCount: String(row.data.adultCount),
      childCount: String(row.data.childCount),
      childRatio: String(
        typeof row.data.childRatio === "number" ? row.data.childRatio : 0.5,
      ),
      householdMasterId: row.data.householdMasterId ?? null,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupId) return;
    const cr = Number(String(form.childRatio).replace(",", ".").trim());
    const input: FamilyInput = {
      name: form.name.trim(),
      adultCount: Number(form.adultCount),
      childCount: Number(form.childCount),
      childRatio: cr,
      memberUserIds: [],
      householdMasterId: form.householdMasterId,
    };
    setBusy(editingId ? "save" : "add");
    setError(null);
    try {
      if (editingId) {
        await updateFamily(groupId, editingId, memberIds, input);
      } else {
        await addFamily(groupId, user.uid, memberIds, input);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    if (!groupId) return;
    if (!confirm("この参加世帯を削除しますか？")) return;
    setBusy(`del-${id}`);
    setError(null);
    try {
      await deleteFamily(groupId, id);
      if (editingId === id) resetForm();
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
        <p className="text-sm text-zinc-600">旅行が見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm text-zinc-900 underline">
          旅行一覧へ
        </Link>
      </div>
    );
  }

  const showChildRatio = Number(form.childCount) > 0;

  const householdsReturnTo = encodeURIComponent(
    `/groups/${groupId}/families?setup=1${
      circleInviteId ? `&circleInvite=${encodeURIComponent(circleInviteId)}` : ""
    }`,
  );

  const inviteUrl =
    group?.inviteCode != null ? buildWelcomeUrl(group.inviteCode) : null;
  const inviteShareText =
    group && inviteUrl
      ? `「${group.name}」の旅行に招待されました！\n参加はこちらから👇\n${inviteUrl}`
      : "";

  async function copyInviteLink() {
    if (!inviteUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 旅行ホーム
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        参加世帯
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        この旅行に参加する世帯を登録します。精算は世帯名単位でまとめられます。
        世帯マスタに登録済みの世帯を選ぶと人数を自動入力できます。
      </p>

      {isSetupMode ? (
        <div
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
          role="status"
        >
          <p className="font-semibold">はじめてのセットアップ</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            支出・精算を使う前に、この旅行の「参加世帯」を1件以上登録してください。
            {households.length === 0
              ? " まだ世帯マスタが無い場合は、先にマスタへ登録すると次回からコピーできます。"
              : " 下の「世帯マスタから選ぶ」か、直接入力で追加できます。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {households.length === 0 ? (
              <Link
                href={`/profile/households?returnTo=${householdsReturnTo}`}
                className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
              >
                世帯マスタを登録する
              </Link>
            ) : null}
            {families.length > 0 ? (
              <Link
                href={
                  afterSetup === "expenses"
                    ? `/groups/${groupId}/expenses`
                    : `/groups/${groupId}`
                }
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-50 dark:hover:bg-amber-900/60"
              >
                {afterSetup === "expenses"
                  ? "支出の記録へ進む"
                  : "旅行ホームへ進む"}
              </Link>
            ) : (
              <Link
                href={`/groups/${groupId}`}
                className="rounded-md border border-amber-300/80 px-3 py-1.5 text-xs font-medium text-amber-900/80 hover:bg-amber-100/80 dark:border-amber-800 dark:text-amber-200"
              >
                あとで登録する
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {circleInviteId && inviteUrl && group ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-50">
          <p className="font-semibold">
            サークル「{circleInviteName ?? "…"}」へ招待を共有
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sky-900/90 dark:text-sky-100/90">
            下のメンバーに招待リンクを送ってください（LINE・コピーなど）。
          </p>
          {circleInviteMembers.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-sky-900/90 dark:text-sky-100/90">
              {circleInviteMembers.map((m) => (
                <li key={m.id}>
                  {m.data.displayName}
                  {m.data.note ? (
                    <span className="text-sky-700/80 dark:text-sky-300/80">
                      {" "}
                      （{m.data.note}）
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-sky-800/80 dark:text-sky-200/80">
              このサークルにメンバーがいません。リンク自体は共有できます。
            </p>
          )}
          <p className="mt-3 break-all font-mono text-[11px] text-sky-900 dark:text-sky-100">
            {inviteUrl}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copyInviteLink()}
              className="rounded-md bg-sky-700 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-sky-800"
            >
              {inviteCopied ? "コピーしました ✓" : "リンクをコピー"}
            </button>
            <a
              href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteShareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-[#06C755] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#05b34c]"
            >
              LINEで送る
            </a>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.share({
                      title: `「${group.name}」への招待`,
                      text: `「${group.name}」の旅行に招待されました！`,
                      url: inviteUrl,
                    });
                  } catch {
                    // cancel
                  }
                }}
                className="rounded-md border border-sky-300 px-2.5 py-1.5 text-[11px] font-medium text-sky-950 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-50 dark:hover:bg-sky-900/50"
              >
                その他で共有
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {/* 追加・編集フォーム */}
      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {editingId ? "世帯を編集" : "世帯を追加"}
        </h2>

        {/* 世帯マスタから選ぶ */}
        {!editingId && households.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowHouseholdPicker((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              世帯マスタから選ぶ
            </button>
            {showHouseholdPicker ? (
              <ul className="mt-2 space-y-1 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                {households.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => applyHousehold(h)}
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {h.data.name}
                      </span>
                      <span className="ml-2 text-xs text-zinc-400">
                        大人 {h.data.defaultAdultCount}
                        {h.data.defaultChildCount > 0
                          ? ` ・ 子供 ${h.data.defaultChildCount}`
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {form.householdMasterId ? (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ 世帯マスタからコピーしました（人数は変更可能です）
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              世帯名
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="例: 奥田家"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                大人の人数
              </label>
              <input
                type="number"
                min={0}
                required
                value={form.adultCount}
                onChange={(e) => setForm((p) => ({ ...p, adultCount: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                子供の人数
              </label>
              <input
                type="number"
                min={0}
                required
                value={form.childCount}
                onChange={(e) => setForm((p) => ({ ...p, childCount: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </div>
            {showChildRatio ? (
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  子供の負担比率
                </label>
                <input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.1}
                  required
                  value={form.childRatio}
                  onChange={(e) => setForm((p) => ({ ...p, childRatio: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
                <p className="mt-0.5 text-[10px] text-zinc-400">大人=1.0・0.1刻みで設定</p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={busy !== null || !user}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {busy === "add" || busy === "save" ? "保存中…" : editingId ? "更新" : "追加"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                キャンセル
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* 登録済みの世帯一覧 */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          登録済みの参加世帯
        </h2>
        {families.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">まだ世帯がありません。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {families.map((row) => {
              const can = user
                ? canManageFamily(group, members, user.uid, row.data.createdByUserId)
                : false;
              return (
                <li
                  key={row.id}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {row.data.name}
                        </p>
                        {row.data.householdMasterId ? (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            マスタ連携
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        大人 {row.data.adultCount} 人
                        {row.data.childCount > 0
                          ? ` ・ 子供 ${row.data.childCount} 人（×${row.data.childRatio ?? "—"}）`
                          : ""}
                      </p>
                      {row.data.memberUserIds.length > 0 ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          アカウント:{" "}
                          {row.data.memberUserIds
                            .map((uid) => {
                              const m = members.find((x) => x.userId === uid);
                              return m?.data.displayName || `${uid.slice(0, 8)}…`;
                            })
                            .join("、")}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-400">
                          アカウント未連携（手動精算）
                        </p>
                      )}
                    </div>
                    {can ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          disabled={busy !== null}
                          className="text-xs text-zinc-600 underline dark:text-zinc-400"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          disabled={busy !== null}
                          className="text-xs text-red-600 hover:underline"
                        >
                          削除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8">
        <Link
          href={`/groups/${groupId}/expenses`}
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          支出・精算へ
        </Link>
      </p>
    </div>
  );
}
