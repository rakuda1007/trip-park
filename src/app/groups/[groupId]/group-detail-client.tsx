"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  buildWelcomeUrl,
  deleteGroup,
  getGroup,
  leaveGroup,
  listMembers,
  removeMember,
  updateDestination,
  updateGroupDescription,
  updateGroupTripDates,
  updateTripStatus,
} from "@/lib/firestore/groups";
import {
  createBulletinTopic,
  listBulletinTopicsWithReplyCounts,
} from "@/lib/firestore/bulletin";
import { saveLastTripId } from "@/lib/last-trip";
import type { GroupDoc, MemberDoc, TripStatus } from "@/types/group";
import type { BulletinCategory, BulletinImportance, BulletinTopicDoc } from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const CATEGORY_LABELS: Record<BulletinCategory, string> = {
  general: "全体連絡", gear: "持ち物", dayof: "当日の連絡", other: "その他",
};
const CATEGORY_OPTIONS: BulletinCategory[] = ["general", "gear", "dayof", "other"];

function formatTs(v: unknown): string {
  if (!v) return "—";
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return "—";
}

function formatDateRange(start: string, end?: string | null): string {
  const ps = start.split("-").map(Number);
  if (ps.length !== 3 || ps.some(Number.isNaN)) return start;
  const [sy, sm, sd] = ps;
  if (!end || end === start) return `${sy}年${sm}月${sd}日`;
  const pe = end.split("-").map(Number);
  if (pe.length !== 3 || pe.some(Number.isNaN)) return `${start} 〜 ${end}`;
  const [ey, em, ed] = pe;
  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}日 〜 ${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日 〜 ${em}月${ed}日`;
  return `${sy}年${sm}月${sd}日 〜 ${ey}年${em}月${ed}日`;
}

export function GroupDetailClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 旅行日程編集用
  const [editingDates, setEditingDates] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  // 目的地編集用
  const [editingDest, setEditingDest] = useState(false);
  const [draftDest, setDraftDest] = useState("");

  // 説明編集用
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState("");

  // 掲示板
  const [topics, setTopics] = useState<{ id: string; data: BulletinTopicDoc; replyCount: number }[]>([]);
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<BulletinCategory>("general");
  const [newImportance, setNewImportance] = useState<BulletinImportance>("normal");

  // 旅行ページを開いたら直近アクセス旅行として記録
  useEffect(() => {
    if (user && groupId) {
      saveLastTripId(user.uid, groupId);
    }
  }, [user, groupId]);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const [m, t] = await Promise.all([
          listMembers(groupId),
          listBulletinTopicsWithReplyCounts(groupId),
        ]);
        setMembers(m);
        setTopics(t);
      } else {
        setMembers([]);
        setTopics([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  async function handleCreateTopic() {
    if (!user || !groupId || !newTitle.trim() || !newBody.trim()) return;
    setBusy("create-topic");
    setError(null);
    try {
      await createBulletinTopic(groupId, user.uid, user.displayName, newTitle, newBody, newCategory, newImportance);
      setNewTitle(""); setNewBody(""); setNewCategory("general"); setNewImportance("normal");
      setShowNewTopicForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = user && group && user.uid === group.ownerId;
  // 未ユーザーでも開けるランディングURLを招待リンクとして使う
  const inviteUrl = group ? buildWelcomeUrl(group.inviteCode) : "";

  function startEditDates() {
    if (!group) return;
    setDraftStart(group.tripStartDate ?? "");
    setDraftEnd(group.tripEndDate ?? "");
    setEditingDates(true);
  }

  async function handleSaveDates() {
    if (!groupId) return;
    if (draftStart && draftEnd && draftEnd < draftStart) {
      setError("終了日は開始日以降にしてください。");
      return;
    }
    setBusy("save-dates");
    setError(null);
    try {
      await updateGroupTripDates(
        groupId,
        draftStart || null,
        draftEnd || draftStart || null,
      );
      setEditingDates(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveDest() {
    if (!groupId) return;
    setBusy("save-dest");
    setError(null);
    try {
      await updateDestination(groupId, draftDest.trim() || null);
      setEditingDest(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateStatus(status: TripStatus) {
    if (!groupId) return;
    setBusy(`status-${status}`);
    setError(null);
    try {
      await updateTripStatus(groupId, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    if (!group || typeof navigator === "undefined" || !navigator.clipboard) return;
    const url = buildWelcomeUrl(group.inviteCode);
    try {
      await navigator.clipboard.writeText(url);
      setBusy("copied");
      setTimeout(() => setBusy(null), 2000);
    } catch {
      setError("コピーに失敗しました");
    }
  }

  async function handleLeave() {
    if (!user || !groupId) return;
    if (!confirm("この旅行から抜けますか？")) return;
    setBusy("leave");
    setError(null);
    try {
      await leaveGroup(user.uid, groupId);
      router.push("/groups");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteGroup() {
    if (!user || !groupId) return;
    if (
      !confirm(
        "旅行を削除します。メンバー全員がアクセスできなくなります。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      await deleteGroup(user.uid, groupId);
      router.push("/groups");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveMember(targetUid: string) {
    if (!user || !groupId) return;
    if (!confirm("このメンバーを旅行から外しますか？")) return;
    setBusy(`remove-${targetUid}`);
    setError(null);
    try {
      await removeMember(user.uid, groupId, targetUid);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
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

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href="/groups"
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 旅行一覧
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {group.name}
      </h1>

      {/* フェーズバッジ */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(() => {
          const s = group.status ?? "planning";
          if (s === "planning")
            return (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                計画中
              </span>
            );
          if (s === "confirmed")
            return (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                旅行確定
              </span>
            );
          return (
            <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              旅行終了
            </span>
          );
        })()}
        {/* オーナーがフェーズを変更できるボタン */}
        {isOwner && (group.status ?? "planning") === "planning" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => handleUpdateStatus("confirmed")}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            {busy === "status-confirmed" ? "更新中…" : "旅行を確定する →"}
          </button>
        ) : null}
        {isOwner && (group.status ?? "planning") === "confirmed" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => handleUpdateStatus("completed")}
            className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            {busy === "status-completed" ? "更新中…" : "旅行終了にする →"}
          </button>
        ) : null}
      </div>

      {/* 説明 */}
      {editingDesc ? (
        <div className="mt-2">
          <textarea
            rows={3}
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="旅行の説明を入力"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("desc");
                try {
                  await updateGroupDescription(groupId, draftDesc.trim() || null);
                  setGroup((g) => g ? { ...g, description: draftDesc.trim() || null } : g);
                  setEditingDesc(false);
                } catch {
                  // ignore
                } finally {
                  setBusy(null);
                }
              }}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy === "desc" ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setEditingDesc(false)}
              className="rounded-md px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-2">
          {group.description ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{group.description}</p>
          ) : (
            isOwner ? (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">説明未設定</span>
            ) : null
          )}
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setDraftDesc(group.description ?? "");
                setEditingDesc(true);
              }}
              className="shrink-0 text-xs text-zinc-400 underline hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              {group.description ? "編集" : "説明を追加"}
            </button>
          ) : null}
        </div>
      )}

      {/* 目的地 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {group.destination ? (
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            📍 {group.destination}
          </span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">目的地未定</span>
        )}
        {isOwner && !editingDest ? (
          <button
            type="button"
            onClick={() => {
              setDraftDest(group.destination ?? "");
              setEditingDest(true);
            }}
            className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {group.destination ? "目的地を変更" : "目的地を設定"}
          </button>
        ) : null}
      </div>

      {/* 目的地編集フォーム */}
      {editingDest && isOwner ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={draftDest}
            onChange={(e) => setDraftDest(e.target.value)}
            placeholder="例: 箱根"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleSaveDest}
            disabled={busy !== null}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === "save-dest" ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => setEditingDest(false)}
            className="text-xs text-zinc-500 underline hover:text-zinc-800"
          >
            キャンセル
          </button>
        </div>
      ) : null}

      {/* 旅行日程 */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {group.tripStartDate ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span>📅</span>
            {formatDateRange(group.tripStartDate, group.tripEndDate)}
          </span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            日程未定
          </span>
        )}
        {isOwner && !editingDates ? (
          <button
            type="button"
            onClick={startEditDates}
            className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {group.tripStartDate ? "日程を変更" : "旅行日程を設定"}
          </button>
        ) : null}
      </div>

      {/* 日程編集フォーム（オーナーのみ） */}
      {editingDates && isOwner ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            旅行日程を設定
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            日程調整で確定した場合は自動的に反映されます。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              開始日
              <input
                type="date"
                value={draftStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftStart(v);
                  setDraftEnd((prev) => (!prev || prev < v ? v : prev));
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              終了日
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSaveDates}
              disabled={busy !== null}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy === "save-dates" ? "保存中…" : "保存"}
            </button>
            {group.tripStartDate ? (
              <button
                type="button"
                onClick={async () => {
                  setDraftStart("");
                  setDraftEnd("");
                  setBusy("save-dates");
                  try {
                    await updateGroupTripDates(groupId, null, null);
                    setEditingDates(false);
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "クリアに失敗しました");
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={busy !== null}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
              >
                日程をクリア
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditingDates(false)}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}

      {/* 旅のステップナビ */}
      {(() => {
        const status = group.status ?? "planning";
        const datesDone = !!group.tripStartDate;
        const destDone = !!group.destination;
        const itinDone = status === "confirmed" || status === "completed";
        const settleDone = status === "completed";

        type Step = {
          key: string;
          label: string;
          sublabel: string;
          done: boolean;
          href: string | null;
          icon: React.ReactNode;
        };

        const steps: Step[] = [
          {
            key: "schedule",
            label: "日程",
            sublabel: datesDone ? "設定済み" : "未設定",
            done: datesDone,
            href: datesDone ? null : `/groups/${groupId}/schedule`,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
              </svg>
            ),
          },
          {
            key: "destination",
            label: "目的地",
            sublabel: destDone ? group.destination! : "未定",
            done: destDone,
            href: `/groups/${groupId}/destination-votes`,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .953.524l.004.002.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
              </svg>
            ),
          },
          {
            key: "trip",
            label: "旅程",
            sublabel: itinDone ? "確認する" : "計画中",
            done: itinDone,
            href: `/groups/${groupId}/trip`,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M8.157 2.176a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.25v10.877a.75.75 0 0 0 1.29.523 2.25 2.25 0 0 1 3.162-.044l.093.09a2.25 2.25 0 0 0 2.81.197l.042-.028a2.25 2.25 0 0 1 2.51 0l.042.028a2.25 2.25 0 0 0 2.81-.197l.093-.09a2.25 2.25 0 0 1 3.162.044.75.75 0 0 0 1.29-.523V5.25a1.5 1.5 0 0 0-.926-1.384l-4.084-1.69a1.5 1.5 0 0 0-1.147 0l-1.023.423a.75.75 0 0 1-.573 0L8.157 2.176Z" clipRule="evenodd" />
              </svg>
            ),
          },
          {
            key: "expenses",
            label: "精算",
            sublabel: settleDone ? "確認する" : "旅行後に",
            done: settleDone,
            href: `/groups/${groupId}/expenses`,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.615Z" />
                <path fillRule="evenodd" d="M9.99 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4 10a6 6 0 0 1 10.607-3.87l-8.477 8.477A6 6 0 0 1 4 10Zm6 6a5.966 5.966 0 0 1-3.607-1.217l8.477-8.477A6 6 0 0 1 16 10a6 6 0 0 1-6 6Z" clipRule="evenodd" />
              </svg>
            ),
          },
        ];

        return (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60">
            {/* ステップナビ */}
            <div className="px-4 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                旅のステップ
              </p>
              <div className="flex items-start">
                {steps.map((step, idx) => {
                  // 日程(0)・目的地(1) はどちらが先に完了してもよいので、
                  // 両ステップのどちらかが未完のうちは両方をハイライト対象にする
                  const firstTwoBothDone = steps[0].done && steps[1].done;
                  const isCurrent = !step.done && (
                    (idx <= 1 && !firstTwoBothDone) ||
                    (idx > 1 && firstTwoBothDone && idx === steps.findIndex((s, i) => i > 1 && !s.done))
                  );
                  const circle = (
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        step.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isCurrent
                            ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                            : "border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-500"
                      }`}
                    >
                      {step.done ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      ) : step.icon}
                    </div>
                  );

                  return (
                    <div key={step.key} className="flex flex-1 flex-col items-center">
                      <div className="flex w-full items-center">
                        <div className="flex flex-1 flex-col items-center">
                          {step.href ? (
                            <Link href={step.href} className="group flex flex-col items-center">
                              <div className="transition-opacity group-hover:opacity-75">{circle}</div>
                              <p className={`mt-1.5 text-xs font-semibold ${step.done ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"}`}>
                                {step.label}
                              </p>
                              <p className="mt-0.5 max-w-[60px] truncate text-center text-[10px] text-zinc-400 dark:text-zinc-500">
                                {step.sublabel}
                              </p>
                            </Link>
                          ) : (
                            <div className="flex flex-col items-center">
                              {circle}
                              <p className={`mt-1.5 text-xs font-semibold ${step.done ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"}`}>
                                {step.label}
                              </p>
                              <p className="mt-0.5 max-w-[60px] truncate text-center text-[10px] text-zinc-400 dark:text-zinc-500">
                                {step.sublabel}
                              </p>
                            </div>
                          )}
                        </div>
                        {idx < steps.length - 1 ? (
                          <div className={`mb-6 h-0.5 flex-1 ${
                            steps[idx + 1]?.done || step.done
                              ? "bg-emerald-300 dark:bg-emerald-700"
                              : "bg-zinc-200 dark:bg-zinc-700"
                          }`} />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        );
      })()}

      {/* ── 掲示板 ── */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">掲示板</h2>
          <div className="flex items-center gap-2">
            {!showNewTopicForm && (
              <button
                type="button"
                onClick={() => setShowNewTopicForm(true)}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ＋ 新しい話題
              </button>
            )}
            <Link
              href={`/groups/${groupId}/bulletin`}
              className="text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              すべて見る →
            </Link>
          </div>
        </div>

        {/* 新規話題フォーム */}
        {showNewTopicForm && (
          <div className="mx-4 mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="mb-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300">新しい話題を立てる</p>
            <div className="space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                placeholder="タイトル（件名）"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={3}
                placeholder="本文"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <div className="flex flex-wrap gap-3">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as BulletinCategory)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <select
                  value={newImportance}
                  onChange={(e) => setNewImportance(e.target.value as BulletinImportance)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="normal">通常</option>
                  <option value="important">重要</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateTopic}
                  disabled={busy !== null || !newTitle.trim() || !newBody.trim()}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {busy === "create-topic" ? "作成中…" : "話題を作成"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewTopicForm(false); setNewTitle(""); setNewBody(""); }}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 話題一覧 */}
        <div className="mt-3 pb-2">
          {topics.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-zinc-400 dark:text-zinc-500">まだ話題がありません。</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topics.map(({ id, data, replyCount }) => (
                <li key={id}>
                  <Link
                    href={`/groups/${groupId}/bulletin/${id}`}
                    className={`flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                      data.importance === "important" || data.pinned
                        ? "bg-amber-50/60 dark:bg-amber-950/15"
                        : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {data.pinned && <span className="text-xs text-amber-600">📌</span>}
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                          {CATEGORY_LABELS[data.category]}
                        </span>
                        {data.importance === "important" && (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">重要</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {data.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {data.authorDisplayName || data.authorUserId.slice(0, 8) + "…"} · {formatTs(data.createdAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400">返信 {replyCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          招待
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          招待コード:{" "}
          <span className="font-mono font-semibold">{group.inviteCode}</span>
        </p>
        <p className="mt-2 break-all text-xs text-zinc-500">{inviteUrl}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyInvite}
            disabled={busy !== null}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {busy === "copied" ? "コピーしました ✓" : "リンクをコピー"}
          </button>
          <a
            href={`https://line.me/R/msg/text/?${encodeURIComponent(`「${group.name}」の旅行に招待されました！\n参加はこちらから👇\n${inviteUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#06C755] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#05b34c]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.444 3.317V8.108c0-.345.282-.63.63-.63.345 0 .628.285.628.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.070 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
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
                  // キャンセルは無視
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.52 2.52 0 0 1 13 4.5Z" />
              </svg>
              その他で共有
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          メンバー
        </h2>
        <ul className="mt-3 space-y-2">
          {members.map(({ userId, data }) => (
            <li
              key={userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/40"
            >
              <span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {data.displayName || userId.slice(0, 8) + "…"}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {data.role === "owner"
                    ? "オーナー"
                    : data.role === "admin"
                      ? "管理者"
                      : "メンバー"}
                </span>
                {userId === user?.uid ? (
                  <span className="ml-1 text-xs text-emerald-600">（あなた）</span>
                ) : null}
              </span>
              {isOwner && userId !== group.ownerId ? (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(userId)}
                  disabled={busy !== null}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  外す
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-zinc-200 pt-8 dark:border-zinc-700">
        {!isOwner ? (
          <button
            type="button"
            onClick={handleLeave}
            disabled={busy !== null}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busy === "leave" ? "処理中…" : "旅行から抜ける"}
          </button>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            onClick={handleDeleteGroup}
            disabled={busy !== null}
            className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
          >
            {busy === "delete" ? "削除中…" : "旅行を削除"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
