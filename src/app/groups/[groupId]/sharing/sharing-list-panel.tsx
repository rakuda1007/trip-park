"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import {
  addSharingItem,
  deleteSharingItem,
  listSharingItems,
  updateSharingItemAssignment,
  updateSharingItemFields,
  type SharingItemRow,
} from "@/lib/firestore/sharing";
import type { GroupDoc, MemberDoc } from "@/types/group";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
        setItems([]);
        return;
      }
      setGroup(g);
      try {
        setMembers(await listMembers(groupId));
      } catch {
        setError("メンバー一覧を読み込めませんでした。");
        setMembers([]);
        setItems([]);
        return;
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

  async function handleAssign(item: SharingItemRow, assignUid: string | null) {
    if (!groupId) return;
    setBusy(`asg-${item.id}`);
    setError(null);
    try {
      if (!assignUid) {
        await updateSharingItemAssignment(groupId, item.id, null, null);
      } else {
        const m = members.find((x) => x.userId === assignUid);
        const name = m?.data.displayName ?? assignUid.slice(0, 6) + "…";
        await updateSharingItemAssignment(
          groupId,
          item.id,
          assignUid,
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
              担当
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
            items.map(({ id, data }) => (
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
                    <select
                      value={data.assignedUserId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        handleAssign({ id, data }, v === "" ? null : v);
                      }}
                      disabled={busy !== null}
                      className="w-full max-w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-900 sm:max-w-[12rem] sm:px-2 sm:text-xs"
                    >
                      <option value="">未割当</option>
                      {members.map(({ userId, data: md }) => (
                        <option key={userId} value={userId}>
                          {md.displayName ?? userId.slice(0, 6) + "…"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>
                      {data.assignedDisplayName ?? (
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const hasItems = items.length > 0;

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
          食材・飲み物など、誰が何を用意するかを共有します。担当はいつでも変更できます。
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
