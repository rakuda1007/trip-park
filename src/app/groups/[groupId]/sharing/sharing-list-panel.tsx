"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import { listFamilies } from "@/lib/firestore/families";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import {
  addSharingItem,
  aggregateSharingAssignmentsByFamily,
  deleteSharingItem,
  listSharingItems,
  reorderSharingItemsOrder,
  updateSharingItemFamilyAssignment,
  updateSharingItemFields,
  type SharingItemRow,
} from "@/lib/firestore/sharing";
import type { FamilyDoc } from "@/types/family";
import type { GroupDoc, MemberDoc } from "@/types/group";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SharingListPanelProps = {
  variant: "page" | "inline";
  /** 追加・更新・削除など一覧が変わったあと（親の要約を合わせるとき） */
  onDataChanged?: () => void;
};

export function SharingListPanel({
  variant,
  onDataChanged,
}: SharingListPanelProps) {
  const groupId = useGroupRouteId();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [families, setFamilies] = useState<{ id: string; data: FamilyDoc }[]>([]);
  const [items, setItems] = useState<SharingItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      if (!g) {
        setGroup(null);
        setMembers([]);
        setFamilies([]);
        setItems([]);
        return;
      }
      setGroup(g);
      try {
        setMembers(await listMembers(groupId));
      } catch {
        setError("メンバー一覧を読み込めませんでした。");
        setMembers([]);
        setFamilies([]);
        setItems([]);
        return;
      }
      try {
        setFamilies(await listFamilies(groupId));
      } catch {
        setFamilies([]);
      }
      try {
        setItems(await listSharingItems(groupId));
      } catch (sub) {
        setItems([]);
        const msg = sub instanceof Error ? sub.message : "";
        setError(
          /permission/i.test(msg)
            ? "分担表の読み込みが拒否されました。リポジトリの firestore.rules を Firebase にデプロイしてください（firebase deploy --only firestore:rules）。"
            : msg || "分担データの読み込みに失敗しました",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const isMember = Boolean(user && members.some((x) => x.userId === user.uid));

  const assignmentSummary = useMemo(
    () => aggregateSharingAssignmentsByFamily(items, families),
    [items, families],
  );

  async function handleAdd() {
    if (!user || !newLabel.trim()) return;
    setBusy("add");
    setError(null);
    try {
      await addSharingItem(groupId, user.uid, user.displayName, {
        label: newLabel,
        memo: newMemo.trim() || null,
      });
      setNewLabel("");
      setNewMemo("");
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleAssignFamily(
    item: SharingItemRow,
    familyId: string | null,
  ) {
    if (!groupId) return;
    setBusy(`asg-${item.id}`);
    setError(null);
    try {
      if (!familyId) {
        await updateSharingItemFamilyAssignment(groupId, item.id, null, null);
      } else {
        const f = families.find((x) => x.id === familyId);
        const name = f?.data.name?.trim() || "世帯";
        await updateSharingItemFamilyAssignment(
          groupId,
          item.id,
          familyId,
          name,
        );
      }
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveEdit(itemId: string) {
    if (!editLabel.trim()) return;
    setBusy(`edit-${itemId}`);
    setError(null);
    try {
      await updateSharingItemFields(groupId, itemId, {
        label: editLabel,
        memo: editMemo.trim() || null,
      });
      setEditingId(null);
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(itemId: string) {
    if (!confirm("この項目を削除しますか？")) return;
    setBusy(`del-${itemId}`);
    setError(null);
    try {
      await deleteSharingItem(groupId, itemId);
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleMoveItem(fromIndex: number, direction: "up" | "down") {
    if (!groupId || busy !== null) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= items.length) return;
    setBusy("reorder");
    setError(null);
    try {
      const next = [...items];
      const tmp = next[fromIndex]!;
      next[fromIndex] = next[toIndex]!;
      next[toIndex] = tmp;
      await reorderSharingItemsOrder(
        groupId,
        next.map((r) => r.id),
      );
      await load();
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "並び替えに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  const formBlock =
    user && isMember ? (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
          項目を追加
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs text-zinc-600 dark:text-zinc-400">
            項目名 <span className="text-red-500">*</span>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={200}
              placeholder="例: 肉・野菜、飲み物、炭"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <label className="block flex-1 text-xs text-zinc-600 dark:text-zinc-400">
            補足（任意）
            <input
              type="text"
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              placeholder="数量・メモ"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy !== null || !newLabel.trim()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === "add" ? "追加中…" : "追加"}
          </button>
        </div>
      </div>
    ) : null;

  const hasItems = items.length > 0;

  const summaryBlock =
    hasItems ? (
      <div
        className="rounded-lg border border-amber-200/90 bg-amber-50/70 p-3 dark:border-amber-800/70 dark:bg-amber-950/30"
        aria-labelledby="sharing-assignment-heading"
      >
        <h3
          id="sharing-assignment-heading"
          className="text-xs font-semibold tracking-tight text-amber-950 dark:text-amber-100"
        >
          世帯ごとの担当（集計）
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-900/85 dark:text-amber-200/75">
          下の「買い出し項目一覧」は行ごとの編集用です。ここでは世帯単位でまとめて確認できます。
        </p>
        <div className="mt-2 space-y-2">
          {assignmentSummary.byFamily.map((row) => (
            <div
              key={row.familyId}
              className="rounded-md border border-amber-200/70 bg-white/90 px-2.5 py-2 dark:border-amber-800/50 dark:bg-zinc-900/50"
            >
              <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                {row.familyName}
                <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                  （{row.itemLabels.length}件）
                </span>
              </p>
              <ul className="mt-1 list-inside list-disc text-[11px] text-zinc-700 dark:text-zinc-300">
                {row.itemLabels.map((lab, i) => (
                  <li key={`${row.familyId}-${i}-${lab}`}>{lab}</li>
                ))}
              </ul>
            </div>
          ))}
          {assignmentSummary.unassignedLabels.length > 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 bg-white/60 px-2.5 py-2 dark:border-zinc-600 dark:bg-zinc-900/30">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                未割当（世帯）
                <span className="ml-1.5 font-normal text-zinc-500">
                  （{assignmentSummary.unassignedLabels.length}件）
                </span>
              </p>
              <ul className="mt-1 list-inside list-disc text-[11px] text-zinc-600 dark:text-zinc-400">
                {assignmentSummary.unassignedLabels.map((lab, i) => (
                  <li key={`un-${i}-${lab}`}>{lab}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {assignmentSummary.legacyMemberLabels.length > 0 ? (
            <div className="rounded-md border border-dashed border-violet-200 bg-violet-50/50 px-2.5 py-2 dark:border-violet-800/60 dark:bg-violet-950/20">
              <p className="text-xs font-medium text-violet-900 dark:text-violet-100">
                旧データ（メンバー割当）
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-violet-800/90 dark:text-violet-200/80">
                {assignmentSummary.legacyMemberLabels.map((row, i) => (
                  <li key={`leg-${i}-${row.label}`}>
                    {row.label}
                    <span className="text-violet-600/90 dark:text-violet-300/80">
                      {" "}
                      → メンバー「{row.displayName?.trim() || "—"}」
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  const tableBlock = (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
      <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 sm:text-xs">
            <th className="w-[22%] min-w-0 px-1.5 py-2 sm:w-[24%] sm:px-3 sm:py-3">
              項目
            </th>
            <th className="w-[20%] min-w-0 px-1.5 py-2 sm:w-[22%] sm:px-3 sm:py-3">
              補足
            </th>
            <th className="w-[35%] min-w-0 px-1.5 py-2 sm:w-[30%] sm:px-3 sm:py-3">
              担当（世帯）
            </th>
            <th className="w-[23%] min-w-0 px-1.5 py-2 sm:w-[24%] sm:px-3 sm:py-3">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-2 py-8 text-center text-zinc-500 sm:px-3"
              >
                まだ項目がありません。上のフォームから追加してください。
              </td>
            </tr>
          ) : (
            items.map((item, rowIndex) => {
              const { id, data } = item;
              return (
              <tr
                key={id}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td className="min-w-0 px-1.5 py-2 align-top font-medium break-words text-zinc-900 sm:px-3 dark:text-zinc-100">
                  {editingId === id ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full min-w-0 rounded border border-zinc-300 px-1 py-1 text-xs sm:px-2 sm:text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    />
                  ) : (
                    <span className="block break-words">{data.label}</span>
                  )}
                </td>
                <td className="min-w-0 px-1.5 py-2 align-top break-words text-zinc-600 sm:px-3 dark:text-zinc-400">
                  {editingId === id ? (
                    <input
                      type="text"
                      value={editMemo}
                      onChange={(e) => setEditMemo(e.target.value)}
                      className="w-full min-w-0 rounded border border-zinc-300 px-1 py-1 text-xs sm:px-2 sm:text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    />
                  ) : (
                    <span className="block break-words">{data.memo ?? "—"}</span>
                  )}
                </td>
                <td className="min-w-0 px-1.5 py-2 align-top sm:px-3">
                  {user && isMember ? (
                    <div className="space-y-1">
                      <select
                        value={data.assignedFamilyId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleAssignFamily(
                            item,
                            v === "" ? null : v,
                          );
                        }}
                        disabled={busy !== null || families.length === 0}
                        className="w-full max-w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-900 sm:max-w-[12rem] sm:px-2 sm:text-xs"
                      >
                        <option value="">
                          {families.length === 0
                            ? "参加世帯を先に登録"
                            : "未割当"}
                        </option>
                        {families.map(({ id: fid, data: fd }) => (
                          <option key={fid} value={fid}>
                            {fd.name}
                          </option>
                        ))}
                      </select>
                      {families.length === 0 ? (
                        <p className="text-[10px] text-amber-800 dark:text-amber-200/90">
                          <Link
                            href={`/groups/${groupId}/families`}
                            className="underline underline-offset-2"
                          >
                            参加世帯
                          </Link>
                          で世帯を登録すると選べます。
                        </p>
                      ) : null}
                      {data.assignedFamilyId == null &&
                      item.legacyMemberAssignee ? (
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          旧データ（メンバー「
                          {item.legacyMemberAssignee.displayName?.trim() ||
                            item.legacyMemberAssignee.userId.slice(0, 6) + "…"}
                          」）→ 上から世帯を選び直してください
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span>
                      {data.assignedFamilyId ? (
                        data.assignedFamilyName ?? (
                          <span className="text-zinc-400">世帯</span>
                        )
                      ) : item.legacyMemberAssignee ? (
                        <span className="text-zinc-500">
                          （旧）メンバー「
                          {item.legacyMemberAssignee.displayName?.trim() ||
                            "—"}
                          」
                        </span>
                      ) : (
                        <span className="text-zinc-400">未割当</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="min-w-0 px-1.5 py-2 align-top sm:px-3">
                  {user && isMember ? (
                    <div className="flex flex-wrap gap-1">
                      {editingId === id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(id)}
                            disabled={busy !== null || !editLabel.trim()}
                            className="text-xs text-zinc-700 underline dark:text-zinc-300"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-xs text-zinc-500"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(rowIndex, "up")}
                            disabled={
                              busy !== null || rowIndex === 0
                            }
                            className="text-xs text-zinc-500 underline disabled:opacity-40 disabled:no-underline"
                            aria-label="上へ移動"
                            title="上へ移動"
                          >
                            上へ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(rowIndex, "down")}
                            disabled={
                              busy !== null ||
                              rowIndex >= items.length - 1
                            }
                            className="text-xs text-zinc-500 underline disabled:opacity-40 disabled:no-underline"
                            aria-label="下へ移動"
                            title="下へ移動"
                          >
                            下へ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(id);
                              setEditLabel(data.label);
                              setEditMemo(data.memo ?? "");
                            }}
                            disabled={busy !== null}
                            className="text-xs text-zinc-600 underline"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(id)}
                            disabled={busy !== null}
                            className="text-xs text-red-600 hover:underline"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const listBody = (
    <>
      {error ? (
        <p
          className={
            variant === "page"
              ? "mt-4 text-sm text-red-600"
              : "text-sm text-red-600"
          }
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {hasItems ? (
        <>
          <div
            className={
              variant === "page" ? "mt-6" : "mt-0"
            }
          >
            {summaryBlock}
          </div>
          <div
            className={
              variant === "page" ? "mt-6" : "mt-4"
            }
          >
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              買い出し項目一覧
            </h2>
            {tableBlock}
          </div>
          {formBlock ? (
            <div className="mt-6">{formBlock}</div>
          ) : null}
        </>
      ) : (
        <>
          {formBlock ? (
            <div className={variant === "page" ? "mt-6" : "mt-0"}>
              {formBlock}
            </div>
          ) : null}
          <div
            className={
              formBlock
                ? variant === "page"
                  ? "mt-8"
                  : "mt-6"
                : variant === "page"
                  ? "mt-6"
                  : "mt-2"
            }
          >
            {tableBlock}
          </div>
        </>
      )}
    </>
  );

  if (variant === "page") {
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

    if (user && !isMember) {
      return (
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
          <p className="text-sm text-zinc-600">
            このグループのメンバーではありません。
          </p>
          <Link
            href={`/groups/${groupId}`}
            className="mt-4 inline-block text-sm underline"
          >
            旅行詳細へ
          </Link>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        >
          ← {group.name}
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          買い出し・分担
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          食材・飲み物など、参加世帯のどれが何を用意するかを共有します。担当（世帯）はいつでも変更できます。
        </p>

        {listBody}
      </div>
    );
  }

  // inline
  if (group === undefined) {
    return (
      <p className="text-sm text-zinc-500" aria-live="polite">
        読み込み中…
      </p>
    );
  }

  if (group === null) {
    return (
      <p className="text-sm text-zinc-600">
        旅行が見つかりません。
      </p>
    );
  }

  if (user && !isMember) {
    return (
      <p className="text-sm text-zinc-600">
        このグループのメンバーではありません。
      </p>
    );
  }

  return <div className="space-y-0">{listBody}</div>;
}
