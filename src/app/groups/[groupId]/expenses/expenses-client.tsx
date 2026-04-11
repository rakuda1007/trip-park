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
  computeSettlementTransfers,
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

type ParticipantRole = "adult" | "child";

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

function parseChildRatio(s: string): number {
  const n = Number(String(s).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0 || n > 1) return 0.5;
  return n;
}

/** 保存済みの重みから大人/子供 UI を復元（近似） */
function inferFamilyRolesFromWeights(
  weights: Record<string, number>,
  participantIds: string[],
): { childRatio: number; roles: Record<string, ParticipantRole> } {
  const ids = [...participantIds];
  const wvals = ids
    .map((id) => weights[id])
    .filter((w): w is number => w != null && w > 0);
  if (wvals.length === 0) {
    return {
      childRatio: 0.5,
      roles: Object.fromEntries(ids.map((id) => [id, "adult" as const])),
    };
  }
  const maxW = Math.max(...wvals);
  const minW = Math.min(...wvals);
  const roles: Record<string, ParticipantRole> = {};
  for (const id of ids) {
    const w = weights[id] ?? 0;
    roles[id] = Math.abs(w - maxW) < 1e-5 ? "adult" : "child";
  }
  const ratio = maxW > 0 ? minW / maxW : 0.5;
  return {
    childRatio: ratio > 0 && ratio <= 1 ? ratio : 0.5,
    roles,
  };
}

function buildFamilyWeights(
  ids: string[],
  roles: Record<string, ParticipantRole>,
  childRatio: number,
): Record<string, number> {
  const cr = Math.min(1, Math.max(0.01, childRatio));
  const o: Record<string, number> = {};
  for (const id of ids) {
    o[id] = roles[id] === "child" ? cr : 1;
  }
  return o;
}

function splitModeLabel(mode: ExpenseSplitMode): string {
  return mode === "weighted" ? "比率割（大人・子供）" : "均等割";
}

/** 一覧用: 重みが同一なら null（大人・子供の区別なし） */
function countAdultChildFromExpense(
  r: ExpenseDoc,
): { adults: number; children: number } | null {
  if (r.splitMode !== "weighted" || !r.weightByUserId) return null;
  const ids = r.participantUserIds;
  const wvals = ids
    .map((id) => r.weightByUserId![id])
    .filter((w): w is number => w != null && w > 0);
  if (wvals.length === 0) return null;
  const maxW = Math.max(...wvals);
  const minW = Math.min(...wvals);
  if (Math.abs(maxW - minW) < 1e-5) return null;
  let adults = 0;
  let children = 0;
  for (const id of ids) {
    const w = r.weightByUserId[id] ?? 0;
    if (Math.abs(w - maxW) < 1e-5) adults += 1;
    else children += 1;
  }
  return { adults, children };
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

export function ExpensesClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [expenses, setExpenses] = useState<{ id: string; data: ExpenseDoc }[]>(
    [],
  );
  const [families, setFamilies] = useState<{ id: string; data: FamilyDoc }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [paidByFamilyId, setPaidByFamilyId] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISODate());
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [memo, setMemo] = useState("");
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>("equal");
  const [childRatioInput, setChildRatioInput] = useState("0.5");
  const [roles, setRoles] = useState<Record<string, ParticipantRole>>({});
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set(),
  );

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  const userToFamilyId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of families) {
      for (const uid of f.data.memberUserIds) m.set(uid, f.id);
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
        const m = await listMembers(groupId);
        setMembers(m);
        const ex = await listExpenses(groupId);
        setExpenses(ex);
        const fam = await listFamilies(groupId);
        setFamilies(fam);
        setSelectedParticipants(new Set(m.map((x) => x.userId)));
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
      if (user?.uid) {
        const mine = families.find((f) =>
          f.data.memberUserIds.includes(user.uid),
        );
        if (mine) return mine.id;
      }
      return families[0]!.id;
    });
  }, [families, user]);

  useEffect(() => {
    setRoles((prev) => {
      const next: Record<string, ParticipantRole> = { ...prev };
      for (const uid of selectedParticipants) {
        if (!(uid in next)) next[uid] = "adult";
      }
      for (const uid of Object.keys(next)) {
        if (!selectedParticipants.has(uid)) delete next[uid];
      }
      return next;
    });
  }, [selectedParticipants]);

  const balances = useMemo(
    () => computeBalancesYen(expenses, userToFamilyId),
    [expenses, userToFamilyId],
  );
  const transfers = useMemo(
    () => computeSettlementTransfers(balances),
    [balances],
  );

  const familyBalances = useMemo(() => {
    if (families.length === 0) return null;
    return aggregateBalancesByFamilyUnit(balances, families);
  }, [balances, families]);

  const familyTransfers = useMemo(() => {
    if (!familyBalances) return [];
    return computeKeyedSettlementTransfers(familyBalances);
  }, [familyBalances]);

  const previewShares = useMemo(() => {
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 1 || selectedParticipants.size === 0) {
      return null;
    }
    const amt = Math.floor(n);
    const ids = [...selectedParticipants].sort();
    if (splitMode === "equal") {
      const m = new Map<string, number>();
      for (const id of ids) m.set(id, 1);
      return distributeWeightedSharesYen(amt, m);
    }
    const cr = parseChildRatio(childRatioInput);
    const w = new Map<string, number>();
    for (const id of ids) {
      w.set(id, roles[id] === "child" ? cr : 1);
    }
    return distributeWeightedSharesYen(amt, w);
  }, [amount, selectedParticipants, splitMode, childRatioInput, roles]);

  const displayName = useCallback(
    (uid: string) => {
      const m = members.find((x) => x.userId === uid);
      return m?.data.displayName || uid.slice(0, 8) + "…";
    },
    [members],
  );

  const resolveBalanceRowLabel = useCallback(
    (key: string) => {
      if (key.startsWith("family:") || key.startsWith("user:")) {
        return resolveSettlementUnitLabel(key, families, displayName);
      }
      return displayName(key);
    },
    [displayName, families],
  );

  const resolvePaidByLabel = useCallback(
    (row: ExpenseDoc) => {
      if (row.paidByFamilyId) {
        const f = families.find((x) => x.id === row.paidByFamilyId);
        return f ? `${f.data.name}（世帯）` : row.paidByFamilyId;
      }
      if (row.paidByUserId) {
        const f = families.find((x) =>
          x.data.memberUserIds.includes(row.paidByUserId!),
        );
        if (f) return `${f.data.name}（世帯・旧形式）`;
        return `${displayName(row.paidByUserId)}（メンバー・旧形式）`;
      }
      return "—";
    },
    [displayName, families],
  );

  function resetForm() {
    setEditingId(null);
    setAmount("");
    setExpenseDate(todayISODate());
    setCategory("food");
    setMemo("");
    setSplitMode("equal");
    setChildRatioInput("0.5");
    setRoles({});
    setSelectedParticipants(new Set(members.map((m) => m.userId)));
    if (families.length > 0) {
      const mine = user
        ? families.find((f) => f.data.memberUserIds.includes(user.uid))
        : undefined;
      setPaidByFamilyId(mine?.id ?? families[0]!.id);
    } else {
      setPaidByFamilyId("");
    }
  }

  function startEdit(row: { id: string; data: ExpenseDoc }) {
    setEditingId(row.id);
    setAmount(String(row.data.amount));
    if (row.data.paidByFamilyId) {
      setPaidByFamilyId(row.data.paidByFamilyId);
    } else if (row.data.paidByUserId) {
      const fid = families.find((f) =>
        f.data.memberUserIds.includes(row.data.paidByUserId!),
      )?.id;
      setPaidByFamilyId(fid ?? "");
    } else {
      setPaidByFamilyId("");
    }
    setExpenseDate(row.data.expenseDate);
    setCategory(row.data.category);
    setMemo(row.data.memo ?? "");
    setSelectedParticipants(new Set(row.data.participantUserIds));
    if (row.data.splitMode === "weighted" && row.data.weightByUserId) {
      setSplitMode("weighted");
      const { childRatio, roles: r } = inferFamilyRolesFromWeights(
        row.data.weightByUserId,
        row.data.participantUserIds,
      );
      setChildRatioInput(String(childRatio));
      setRoles(r);
    } else {
      setSplitMode("equal");
      setChildRatioInput("0.5");
      setRoles({});
    }
  }

  function toggleParticipant(uid: string) {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function setRole(uid: string, role: ParticipantRole) {
    setRoles((prev) => ({ ...prev, [uid]: role }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupId) return;
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      setError("金額を入力してください。");
      return;
    }
    const cr = parseChildRatio(childRatioInput);
    const pids = [...selectedParticipants];
    const weightByUserId =
      splitMode === "weighted"
        ? buildFamilyWeights(pids, roles, cr)
        : undefined;
    const input: ExpenseInput = {
      amount: Math.floor(n),
      paidByFamilyId,
      expenseDate,
      category,
      memo,
      splitMode,
      participantUserIds: pids,
      weightByUserId,
    };
    const familyRefs = families.map((f) => ({
      id: f.id,
      memberUserIds: f.data.memberUserIds,
    }));
    setBusy(editingId ? "save" : "add");
    setError(null);
    try {
      if (editingId) {
        await updateExpense(groupId, editingId, memberIds, familyRefs, input);
      } else {
        await addExpense(groupId, user.uid, memberIds, familyRefs, input);
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
        ← グループ詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        支出・精算
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        チェックを付けたメンバーだけが負担に含まれます（
        <span className="font-semibold">メンバー除外</span>
        ＝チェックを外す）。立て替えは
        <span className="font-semibold">世帯単位</span>
        です（一人なら一人世帯）。
        <Link
          href={`/groups/${groupId}/families`}
          className="font-medium text-emerald-800 underline dark:text-emerald-400"
        >
          家族（世帯）の登録
        </Link>
        が必須です。負担の分け方は
        <span className="font-semibold">均等割</span>か
        <span className="font-semibold">比率割（大人・子供）</span>
        を選べます。下の「家族別の精算」で世帯同士の目安も確認できます。
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
                <option value="">先に家族（世帯）を登録してください</option>
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
                家族（世帯）
              </Link>
              で少なくとも1件の世帯を作成し、メンバーを紐付けてください。
            </p>
          ) : null}
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">
            カテゴリ
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ExpenseCategory)
              }
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

          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              負担に含めるメンバー
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              チェックを外した人はこの支出の負担から除外されます。
            </p>
            <ul className="mt-2 space-y-2">
              {members.map(({ userId, data }) => (
                <li key={userId}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedParticipants.has(userId)}
                      onChange={() => toggleParticipant(userId)}
                    />
                    <span>{data.displayName || userId.slice(0, 8) + "…"}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-zinc-500">
              立て替えた世帯のメンバーも負担に含める場合はチェックを入れてください。
            </p>
          </div>

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
                  onChange={() => {
                    setSplitMode("equal");
                    setRoles({});
                  }}
                />
                均等割
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="splitMode"
                  checked={splitMode === "weighted"}
                  onChange={() => {
                    setSplitMode("weighted");
                    setRoles(
                      Object.fromEntries(
                        [...selectedParticipants].map((id) => [id, "adult" as const]),
                      ),
                    );
                  }}
                />
                比率割（大人・子供）
              </label>
            </div>
          </div>

          {splitMode === "weighted" ? (
            <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-900/40">
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                子供の重み（大人を 1 としたとき）
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.05}
                  value={childRatioInput}
                  onChange={(e) => setChildRatioInput(e.target.value)}
                  className="mt-1 w-full max-w-[12rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <p className="mt-2 text-xs text-zinc-500">
                例: 0.5 ＝子供は大人の半分負担。4人家族で大人3・子供1なら、該当する1人を「子供」にします。
              </p>
              <p className="mt-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                各メンバーの区分
              </p>
              <ul className="mt-2 space-y-2">
                {[...selectedParticipants].sort().map((uid) => (
                  <li
                    key={uid}
                    className="flex flex-wrap items-center gap-3 text-sm"
                  >
                    <span className="min-w-[6rem]">
                      {displayName(uid)}
                    </span>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`role-${uid}`}
                        checked={(roles[uid] ?? "adult") === "adult"}
                        onChange={() => setRole(uid, "adult")}
                      />
                      大人
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`role-${uid}`}
                        checked={(roles[uid] ?? "adult") === "child"}
                        onChange={() => setRole(uid, "child")}
                      />
                      子供
                    </label>
                  </li>
                ))}
              </ul>
              {selectedParticipants.size === 0 ? (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  負担メンバーを1人以上選んでください。
                </p>
              ) : null}
            </div>
          ) : null}

          {previewShares && selectedParticipants.size > 0 ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-medium">負担の目安（円）</p>
              <ul className="mt-2 space-y-0.5">
                {[...previewShares.entries()]
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([uid, yen]) => (
                    <li key={uid}>
                      {displayName(uid)}: {formatYen(yen)}
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

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          精算の目安
        </h2>
        {expenses.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            支出がまだありません。登録すると残高と送金リストが表示されます。
          </p>
        ) : (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              メンバー別
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {[...balances.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([key, bal]) => (
                  <li key={key}>
                    {resolveBalanceRowLabel(key)}:{" "}
                    {bal > 0.5
                      ? `${formatYen(Math.round(bal))} 受け取り`
                      : bal < -0.5
                        ? `${formatYen(Math.round(-bal))} 支払い`
                        : "±0"}
                  </li>
                ))}
            </ul>
            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-500">
                送金（最小回数のたたき）
              </p>
              {transfers.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-600">精算不要です。</p>
              ) : (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  {transfers.map((t, i) => (
                    <li key={i}>
                      {resolveBalanceRowLabel(t.fromUserId)} は{" "}
                      {resolveBalanceRowLabel(t.toUserId)} に{" "}
                      {formatYen(t.amountYen)} を払う
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {families.length > 0 && familyBalances ? (
              <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
                  家族別の精算（世帯単位）
                </h3>
                <p className="mt-2 text-xs text-emerald-900/90 dark:text-emerald-100/90">
                  登録した世帯に属するメンバーの残高を合算し、奥田・大木のように世帯同士の送金の目安を出します。どの世帯にも属さないメンバーは「未所属」として表示されます。
                </p>
                <ul className="mt-3 space-y-1 text-sm text-emerald-950 dark:text-emerald-100">
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
                    世帯間の送金（最小回数のたたき）
                  </p>
                  {familyTransfers.length === 0 ? (
                    <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">
                      精算不要です。
                    </p>
                  ) : (
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      {familyTransfers.map((t, i) => (
                        <li key={i}>
                          {resolveSettlementUnitLabel(
                            t.fromKey,
                            families,
                            displayName,
                          )}{" "}
                          は{" "}
                          {resolveSettlementUnitLabel(
                            t.toKey,
                            families,
                            displayName,
                          )}{" "}
                          に {formatYen(t.amountYen)} を払う
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

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
              const ac = countAdultChildFromExpense(row.data);
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
                          {CATEGORY_LABELS[row.data.category]} ·{" "}
                          {row.data.expenseDate}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {splitModeLabel(row.data.splitMode)}
                        {ac && ac.children > 0
                          ? `（大人${ac.adults}・子供${ac.children}）`
                          : row.data.splitMode === "weighted"
                            ? "（大人・子供）"
                            : ""}
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
                        {row.data.participantUserIds
                          .map((id) => displayName(id))
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
