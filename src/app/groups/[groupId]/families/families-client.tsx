"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  addFamily,
  deleteFamily,
  listFamilies,
  updateFamily,
  type FamilyInput,
} from "@/lib/firestore/families";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import { listHouseholds, type HouseholdItem } from "@/lib/firestore/households";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { FamilyDoc } from "@/types/family";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>([]);
  const [families, setFamilies] = useState<{ id: string; data: FamilyDoc }[]>([]);
  const [households, setHouseholds] = useState<HouseholdItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      .then(setHouseholds)
      .catch(() => {});
  }, [user]);

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

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 旅行詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        参加世帯
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        この旅行に参加する世帯を登録します。精算は世帯名単位でまとめられます。
        世帯マスタに登録済みの世帯を選ぶと人数を自動入力できます。
      </p>

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
                  min={0.01}
                  max={1}
                  step={0.05}
                  required
                  value={form.childRatio}
                  onChange={(e) => setForm((p) => ({ ...p, childRatio: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
                <p className="mt-0.5 text-[10px] text-zinc-400">大人=1.0</p>
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
