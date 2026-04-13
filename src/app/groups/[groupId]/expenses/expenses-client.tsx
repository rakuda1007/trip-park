"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  addExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
  type ExpenseInput,
} from "@/lib/firestore/expenses";
import { listFamilies } from "@/lib/firestore/families";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import {
  aggregateBalancesByFamilyUnit,
  computeBalancesYen,
  computeKeyedSettlementTransfers,
  distributeWeightedSharesYen,
  resolveSettlementUnitLabel,
} from "@/lib/settlement";
import type { FamilyDoc } from "@/types/family";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { ExpenseCategory, ExpenseDoc, ExpenseSplitMode } from "@/types/expense";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "食材・飲食",
  transport: "交通",
  lodging: "宿泊",
  other: "その他",
};

const CATEGORY_OPTIONS: ExpenseCategory[] = [
  "food",
  "transport",
  "lodging",
  "other",
];

function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function splitModeLabel(mode: ExpenseSplitMode): string {
  return mode === "weighted" ? "人数割" : "均等割";
}

function canManageExpense(
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

/** 世帯の人数割重みを計算（大人 * 1 + 子供 * childRatio） */
function familyWeight(data: FamilyDoc): number {
  const cr = typeof data.childRatio === "number" ? data.childRatio : 1;
  const w = data.adultCount + data.childCount * cr;
  return w > 0 ? w : 1;
}

export function ExpensesClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>([]);
  const [expenses, setExpenses] = useState<{ id: string; data: ExpenseDoc }[]>([]);
  const [families, setFamilies] = useState<{ id: string; data: FamilyDoc }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [paidByFamilyId, setPaidByFamilyId] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISODate());
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [memo, setMemo] = useState("");
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>("equal");
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<Set<string>>(new Set());

  const userToFamilyId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of families) {
      for (const uid of f.data.memberUserIds ?? []) m.set(uid, f.id);
    }
    return m;
  }, [families]);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const [m, ex, fam] = await Promise.all([
          listMembers(groupId),
          listExpenses(groupId),
          listFamilies(groupId),
        ]);
        setMembers(m);
        setExpenses(ex);
        setFamilies(fam);
        setSelectedFamilyIds(new Set(fam.map((f) => f.id)));
      } else {
        setMembers([]);
        setExpenses([]);
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
    if (families.length === 0) return;
    setPaidByFamilyId((prev) => {
      if (prev && families.some((f) => f.id === prev)) return prev;
      return families[0]!.id;
    });
  }, [families]);

  const balances = useMemo(
    () => computeBalancesYen(expenses, userToFamilyId),
    [expenses, userToFamilyId],
  );

  const familyBalances = useMemo(
    () => aggregateBalancesByFamilyUnit(balances, families),
    [balances, families],
  );

  const familyTransfers = useMemo(
    () => computeKeyedSettlementTransfers(familyBalances),
    [familyBalances],
  );

  const displayName = useCallback(
    (uid: string) => {
      const m = members.find((x) => x.userId === uid);
      return m?.data.displayName || uid.slice(0, 8) + "…";
    },
    [members],
  );

  const familyName = useCallback(
    (fid: string) => {
      const f = families.find((x) => x.id === fid);
      return f ? f.data.name : fid;
    },
    [families],
  );

  const resolvePaidByLabel = useCallback(
    (row: ExpenseDoc) => {
      if (row.paidByFamilyId) {
        const f = families.find((x) => x.id === row.paidByFamilyId);
        return f ? f.data.name : row.paidByFamilyId;
      }
      if (row.paidByUserId) {
        const f = families.find((x) =>
          (x.data.memberUserIds ?? []).includes(row.paidByUserId!),
        );
        if (f) return f.data.name;
        return displayName(row.paidByUserId);
      }
      return "—";
    },
    [displayName, families],
  );

  const previewShares = useMemo(() => {
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 1 || selectedFamilyIds.size === 0) return null;
    const amt = Math.floor(n);
    const wmap = new Map<string, number>();
    for (const fid of selectedFamilyIds) {
      const fam = families.find((f) => f.id === fid);
      if (!fam) continue;
      const w = splitMode === "weighted" ? familyWeight(fam.data) : 1;
      wmap.set(fid, w);
    }
    return distributeWeightedSharesYen(amt, wmap);
  }, [amount, selectedFamilyIds, splitMode, families]);

  function resetForm() {
    setEditingId(null);
    setAmount("");
    setExpenseDate(todayISODate());
    setCategory("food");
    setMemo("");
    setSplitMode("equal");
    setSelectedFamilyIds(new Set(families.map((f) => f.id)));
    if (families.length > 0) {
      setPaidByFamilyId(families[0]!.id);
    } else {
      setPaidByFamilyId("");
    }
  }

  function startEdit(row: { id: string; data: ExpenseDoc }) {
    setEditingId(row.id);
    setAmount(String(row.data.amount));
    if (row.data.paidByFamilyId) {
      setPaidByFamilyId(row.data.paidByFamilyId);
    } else {
      setPaidByFamilyId("");
    }
    setExpenseDate(row.data.expenseDate);
    setCategory(row.data.category);
    setMemo(row.data.memo ?? "");
    // 新形式
    if (row.data.participantFamilyIds && row.data.participantFamilyIds.length > 0) {
      setSelectedFamilyIds(new Set(row.data.participantFamilyIds));
    } else {
      // 旧形式: 全世帯を選択
      setSelectedFamilyIds(new Set(families.map((f) => f.id)));
    }
    setSplitMode(row.data.splitMode ?? "equal");
  }

  function toggleFamily(fid: string) {
    setSelectedFamilyIds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupId) return;
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      setError("金額を入力してください。");
      return;
    }
    const selectedList = [...selectedFamilyIds];
    const weightByFamilyId: Record<string, number> | undefined =
      splitMode === "weighted"
        ? Object.fromEntries(
            selectedList.map((fid) => {
              const fam = families.find((f) => f.id === fid);
              return [fid, fam ? familyWeight(fam.data) : 1];
            }),
          )
        : undefined;

    const input: ExpenseInput = {
      amount: Math.floor(n),
      paidByFamilyId,
      expenseDate,
      category,
      memo,
      splitMode,
      participantFamilyIds: selectedList,
      weightByFamilyId,
    };
    const familyRefs = families.map((f) => ({ id: f.id }));
    setBusy(editingId ? "save" : "add");
    setError(null);
    try {
      if (editingId) {
        await updateExpense(groupId, editingId, familyRefs, input);
      } else {
        await addExpense(groupId, user.uid, familyRefs, input);
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
    if (!confirm("この支出を削除しますか？")) return;
    setBusy(`del-${id}`);
    setError(null);
    try {
      await deleteExpense(groupId, id);
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
        ← 旅行詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        支出・精算
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        立て替えと負担の対象は
        <span className="font-semibold">世帯単位</span>
        です。
        <Link
          href={`/groups/${groupId}/families`}
          className="font-medium text-emerald-800 underline dark:text-emerald-400"
        >
          参加世帯の登録
        </Link>
        が必要です。
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {editingId ? "支出を編集" : "支出を追加"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              金額（円）<span className="text-red-600">*</span>
              <input
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 3500"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              日付
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>

          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            立て替えた世帯
            <select
              required
              value={paidByFamilyId}
              onChange={(e) => setPaidByFamilyId(e.target.value)}
              disabled={families.length === 0}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
            >
              {families.length === 0 ? (
                <option value="">先に参加世帯を登録してください</option>
              ) : (
                families.map(({ id, data }) => (
                  <option key={id} value={id}>
                    {data.name}（大人{data.adultCount}・子供{data.childCount}）
                  </option>
                ))
              )}
            </select>
          </label>

          {families.length === 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              支出を登録するには、
              <Link
                href={`/groups/${groupId}/families`}
                className="font-medium underline"
              >
                参加世帯
              </Link>
              を先に登録してください。
            </p>
          ) : null}

          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            カテゴリ
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            メモ
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>

          {/* 負担の対象 */}
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              負担の対象
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              チェックを外した世帯はこの支出の負担から除外されます。
            </p>
            {families.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-400">世帯がありません</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {families.map(({ id, data }) => (
                  <li key={id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedFamilyIds.has(id)}
                        onChange={() => toggleFamily(id)}
                      />
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {data.name}
                      </span>
                      <span className="text-xs text-zinc-400">
                        大人{data.adultCount}・子供{data.childCount}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 負担の分け方 */}
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              負担の分け方
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="splitMode"
                  checked={splitMode === "equal"}
                  onChange={() => setSplitMode("equal")}
                />
                均等割（世帯ごとに同額）
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="splitMode"
                  checked={splitMode === "weighted"}
                  onChange={() => setSplitMode("weighted")}
                />
                人数割（大人・子供比率考慮）
              </label>
            </div>
            {splitMode === "weighted" && selectedFamilyIds.size > 0 ? (
              <div className="mt-2 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">各世帯の重み（参考）</p>
                <ul className="mt-1.5 space-y-0.5">
                  {[...selectedFamilyIds].map((fid) => {
                    const fam = families.find((f) => f.id === fid);
                    if (!fam) return null;
                    const w = familyWeight(fam.data);
                    return (
                      <li key={fid}>
                        {fam.data.name}: {w.toFixed(1)}
                        <span className="ml-1 text-zinc-400">
                          （大人{fam.data.adultCount} × 1 + 子供{fam.data.childCount} × {fam.data.childRatio ?? 1}）
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          {/* プレビュー */}
          {previewShares && selectedFamilyIds.size > 0 ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-medium">負担の目安（円）</p>
              <ul className="mt-2 space-y-0.5">
                {[...previewShares.entries()]
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([fid, yen]) => (
                    <li key={fid}>
                      {familyName(fid)}: {formatYen(yen)}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={
                busy !== null ||
                !user ||
                families.length === 0 ||
                !paidByFamilyId
              }
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {busy === "add" || busy === "save"
                ? "保存中…"
                : editingId
                  ? "更新する"
                  : "追加する"}
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

      {/* 精算の目安 */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          精算の目安
        </h2>
        {expenses.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            支出がまだありません。登録すると残高と送金リストが表示されます。
          </p>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
              世帯別の残高
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-emerald-950 dark:text-emerald-100">
              {[...familyBalances.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([key, bal]) => (
                  <li key={key}>
                    {resolveSettlementUnitLabel(key, families, displayName)}:{" "}
                    {bal > 0.5
                      ? `${formatYen(Math.round(bal))} 受け取り`
                      : bal < -0.5
                        ? `${formatYen(Math.round(-bal))} 支払い`
                        : "±0"}
                  </li>
                ))}
            </ul>
            <div className="mt-4">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                送金（最小回数）
              </p>
              {familyTransfers.length === 0 ? (
                <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">
                  精算不要です。
                </p>
              ) : (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  {familyTransfers.map((t, i) => (
                    <li key={i}>
                      {resolveSettlementUnitLabel(t.fromKey, families, displayName)} は{" "}
                      {resolveSettlementUnitLabel(t.toKey, families, displayName)} に{" "}
                      {formatYen(t.amountYen)} を払う
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 支出一覧 */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          支出一覧
        </h2>
        {expenses.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">まだ支出がありません。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {expenses.map((row) => {
              const can = user
                ? canManageExpense(group, members, user.uid, row.data.createdByUserId)
                : false;
              return (
                <li
                  key={row.id}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatYen(row.data.amount)}{" "}
                        <span className="text-xs font-normal text-zinc-500">
                          {CATEGORY_LABELS[row.data.category]} · {row.data.expenseDate}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {splitModeLabel(row.data.splitMode)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        立て替え: {resolvePaidByLabel(row.data)}
                      </p>
                      {row.data.memo ? (
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {row.data.memo}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-zinc-500">
                        負担:{" "}
                        {row.data.participantFamilyIds && row.data.participantFamilyIds.length > 0
                          ? row.data.participantFamilyIds
                              .map((fid) => familyName(fid))
                              .join("、")
                          : row.data.participantUserIds
                              .map((uid) => displayName(uid))
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
    </div>
  );
}
