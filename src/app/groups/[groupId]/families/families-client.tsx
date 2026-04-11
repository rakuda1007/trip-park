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
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { FamilyDoc } from "@/types/family";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

export function FamiliesClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [families, setFamilies] = useState<{ id: string; data: FamilyDoc }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adultCount, setAdultCount] = useState("2");
  const [childCount, setChildCount] = useState("0");
  const [childRatioInput, setChildRatioInput] = useState("0.5");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  const memberIds = new Set(members.map((m) => m.userId));

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const m = await listMembers(groupId);
        setMembers(m);
        const f = await listFamilies(groupId);
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

  function resetForm() {
    setEditingId(null);
    setName("");
    setAdultCount("2");
    setChildCount("0");
    setChildRatioInput("0.5");
    setSelectedMembers(new Set());
  }

  function startEdit(row: { id: string; data: FamilyDoc }) {
    setEditingId(row.id);
    setName(row.data.name);
    setAdultCount(String(row.data.adultCount));
    setChildCount(String(row.data.childCount));
    const cr =
      typeof row.data.childRatio === "number" && Number.isFinite(row.data.childRatio)
        ? row.data.childRatio
        : 0.5;
    setChildRatioInput(String(cr));
    setSelectedMembers(new Set(row.data.memberUserIds));
  }

  function toggleMember(uid: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupId) return;
    const crParsed = Number(String(childRatioInput).replace(",", ".").trim());
    const input: FamilyInput = {
      name: name.trim(),
      adultCount: Number(adultCount),
      childCount: Number(childCount),
      childRatio: selectedMembers.size >= 2 ? crParsed : 1,
      memberUserIds: [...selectedMembers],
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
    if (!confirm("この世帯を削除しますか？")) return;
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
        家族（世帯）
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        例: 「奥田」に大人2・子供2、「大木」に大人3・子供1のように登録し、メンバーアカウントを世帯に紐付けます。
        支出の立て替えは世帯単位です（一人なら一人世帯）。世帯にメンバーが2人以上いる場合は、大人・子供の人数と子供比率（大人1人を1とした子供の重み）を登録してください。
        精算の目安は世帯単位にまとめて表示できます。1人のメンバーは1つの世帯のみに入れられます。
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {editingId ? "世帯を編集" : "世帯を追加"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            世帯名（例: 奥田、大木）
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              大人の人数
              <input
                type="number"
                min={0}
                required
                value={adultCount}
                onChange={(e) => setAdultCount(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              子供の人数
              <input
                type="number"
                min={0}
                required
                value={childCount}
                onChange={(e) => setChildCount(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
          {selectedMembers.size >= 2 ? (
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              子供比率（大人1人を1としたときの子供1人の重み）
              <input
                type="number"
                min={0.01}
                max={1}
                step={0.05}
                required
                value={childRatioInput}
                onChange={(e) => setChildRatioInput(e.target.value)}
                className="mt-1 w-full max-w-[14rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          ) : (
            <p className="text-xs text-zinc-500">
              メンバーが1人だけの世帯では、子供比率は不要です（内部では1として保存されます）。
            </p>
          )}
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              この世帯に含めるメンバー（アカウント）
            </p>
            <ul className="mt-2 space-y-2">
              {members.map(({ userId, data }) => (
                <li key={userId}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMembers.has(userId)}
                      onChange={() => toggleMember(userId)}
                    />
                    <span>{data.displayName || userId.slice(0, 8) + "…"}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-zinc-500">
              人数と子供比率は、世帯にメンバーが2人以上いるときの登録必須項目です。実際の負担の分け方は支出画面でメンバーごとに設定します。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          登録済みの世帯
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
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {row.data.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        大人 {row.data.adultCount} 人 · 子供 {row.data.childCount} 人
                        {row.data.memberUserIds.length >= 2 ? (
                          <>
                            {" "}
                            · 子供比率{" "}
                            {typeof row.data.childRatio === "number"
                              ? row.data.childRatio
                              : "—"}
                          </>
                        ) : null}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        メンバー:{" "}
                        {row.data.memberUserIds
                          .map((uid) => {
                            const m = members.find((x) => x.userId === uid);
                            return m?.data.displayName || uid.slice(0, 8) + "…";
                          })
                          .join("、")}
                      </p>
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
                  <p className="mt-2 text-xs text-zinc-400">
                    登録: {formatTs(row.data.createdAt)}
                  </p>
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
