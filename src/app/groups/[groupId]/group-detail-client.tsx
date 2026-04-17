"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
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
} from "@/lib/firestore/groups";
import {
  createBulletinTopic,
  listBulletinTopicsWithReplyCounts,
} from "@/lib/firestore/bulletin";
import { listSharingItems, sharingSummaryStats } from "@/lib/firestore/sharing";
import { sendNotification } from "@/lib/notify";
import { saveLastTripId } from "@/lib/last-trip";
import type { GroupDoc, MemberDoc } from "@/types/group";
import { fetchRecipePollFromUrls } from "@/lib/recipe-preview-api";
import { parseRecipeUrlLines } from "@/lib/recipe-url-input";
import { BulletinTopicTagsField } from "@/components/bulletin-topic-tags-field";
import { VisibilityBadge } from "@/components/visibility-badge";
import {
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_CATEGORY_OPTIONS,
  BULLETIN_TOPIC_TAG_LABELS,
  type BulletinCategory,
  type BulletinImportance,
  type BulletinTopicDoc,
  type BulletinTopicTag,
  type RecipePollData,
  normalizeBulletinTopicTags,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import { SharingListPanel } from "@/app/groups/[groupId]/sharing/sharing-list-panel";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** トピック一覧・ダッシュボード共通の本文プレビュー */
function excerptBulletinBody(data: BulletinTopicDoc, max = 120): string {
  if (data.category === "recipe_vote" && data.recipePoll?.candidates?.length) {
    return `候補 ${data.recipePoll.candidates.length}件のレシピ投票`;
  }
  const t = data.body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

export function GroupDetailClient() {
  const groupId = useGroupRouteId();
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

  // トピック
  const [topics, setTopics] = useState<
    { id: string; data: BulletinTopicDoc; replyCount: number }[]
  >([]);
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<BulletinCategory>("general");
  const [newImportance, setNewImportance] =
    useState<BulletinImportance>("normal");
  const [newTags, setNewTags] = useState<BulletinTopicTag[]>([]);

  /** 買い出し・分担（トピック欄の要約用） */
  const [sharingSummary, setSharingSummary] = useState<{
    total: number;
    unassigned: number;
  }>({ total: 0, unassigned: 0 });
  const [shoppingOpen, setShoppingOpen] = useState(false);

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
      if (!g) {
        setGroup(null);
        setMembers([]);
        setTopics([]);
        setSharingSummary({ total: 0, unassigned: 0 });
        return;
      }
      setGroup(g);
      // メンバーは必須。トピック・分担は個別に失敗しても旅行トップは表示する（権限未デプロイ等）
      try {
        setMembers(await listMembers(groupId));
      } catch {
        setMembers([]);
        setError(
          "メンバー一覧を読み込めませんでした。ネットワークまたは権限を確認してください。",
        );
        setTopics([]);
        setSharingSummary({ total: 0, unassigned: 0 });
        return;
      }
      try {
        const t = await listBulletinTopicsWithReplyCounts(groupId);
        setTopics(t);
      } catch {
        setTopics([]);
      }
      try {
        const s = await listSharingItems(groupId);
        const st = sharingSummaryStats(s);
        setSharingSummary({
          total: st.total,
          unassigned: st.unassigned,
        });
      } catch {
        setSharingSummary({ total: 0, unassigned: 0 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  async function handleCreateTopic() {
    if (!user || !groupId || !newTitle.trim()) return;
    if (newCategory !== "recipe_vote" && !newBody.trim()) return;
    if (
      newCategory === "recipe_vote" &&
      parseRecipeUrlLines(newBody).length === 0
    ) {
      return;
    }
    setBusy("create-topic");
    setError(null);
    try {
      const savedTitle = newTitle.trim();
      let recipePoll: RecipePollData | null = null;
      if (newCategory === "recipe_vote") {
        const urls = parseRecipeUrlLines(newBody);
        recipePoll = await fetchRecipePollFromUrls(urls);
      }
      const topicId = await createBulletinTopic(
        groupId,
        user.uid,
        user.displayName,
        newTitle,
        newBody,
        newCategory,
        newImportance,
        recipePoll ?? undefined,
        newTags,
      );
      setNewTitle("");
      setNewBody("");
      setNewCategory("general");
      setNewImportance("normal");
      setNewTags([]);
      setShowNewTopicForm(false);
      await load();
      // 通知送信（失敗しても続行）
      sendNotification({
        type: "bulletin_topic",
        groupId,
        groupName: group?.name ?? "",
        topicId,
        topicTitle: savedTitle,
        authorName: user.displayName ?? "メンバー",
        authorUid: user.uid,
      });
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

  async function copyInvite() {
    if (!group || typeof navigator === "undefined" || !navigator.clipboard)
      return;
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
        {error ? (
          <p
            className="mt-2 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Link
          href="/groups"
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
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

      {/* 旅行名 + 日程バッジ（旅行名はダッシュボードへ） */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          <Link
            href={`/groups/${groupId}`}
            className="rounded-md hover:text-zinc-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:text-zinc-200"
          >
            {group.name}
          </Link>
        </h1>
        {group.tripStartDate ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span>📅</span>
            {formatDateRange(group.tripStartDate, group.tripEndDate)}
          </span>
        ) : null}
        {isOwner && !editingDates ? (
          <button
            type="button"
            onClick={startEditDates}
            className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {group.tripStartDate ? "日程を変更" : "日程を設定"}
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
                  await updateGroupDescription(
                    groupId,
                    draftDesc.trim() || null,
                  );
                  setGroup((g) =>
                    g ? { ...g, description: draftDesc.trim() || null } : g,
                  );
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {group.description}
            </p>
          ) : isOwner ? (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              説明未設定
            </span>
          ) : null}
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

      {/* 日程編集フォーム（オーナーのみ） */}
      {editingDates && isOwner ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              旅行日程を設定
            </p>
            <VisibilityBadge kind="owner" />
          </div>
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
                    setError(
                      e instanceof Error ? e.message : "クリアに失敗しました",
                    );
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

      {/* ── 買出しリスト（トピックの上・折りたたみ） ── */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShoppingOpen((o) => !o)}
          aria-expanded={shoppingOpen}
          aria-controls="group-sharing-panel"
          className="text-left text-sm text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <span className="select-none" aria-hidden>
            {shoppingOpen ? "▼" : "▶"}
          </span>
          買出しリスト（全{sharingSummary.total}項目、未割当
          {sharingSummary.unassigned}項目）
        </button>
        {shoppingOpen ? (
          <div
            id="group-sharing-panel"
            role="region"
            className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/60"
          >
            <SharingListPanel
              variant="inline"
              onDataChanged={() => {
                void load();
              }}
            />
          </div>
        ) : null}
      </div>

      {/* ── トピック（見出し帯と本文・一覧で色とレイアウトを分ける） ── */}
      <section className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-emerald-50/95 to-white px-4 py-4 dark:border-emerald-900/45 dark:from-emerald-950/50 dark:via-emerald-950/35 dark:to-zinc-900/80">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-emerald-200/90 dark:bg-zinc-900 dark:ring-emerald-800/60"
                aria-hidden
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              </div>
              <h2 className="whitespace-nowrap text-sm font-semibold leading-none tracking-tight text-emerald-950 dark:text-emerald-100">
                トピック
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
          <p className="mt-2 w-full min-w-0 text-left text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            話題ごとにチャットでやり取りできます。
          </p>
        </div>

        {/* 新規話題フォーム */}
        {showNewTopicForm && (
          <div className="mx-4 mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="mb-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              新しい話題を立てる
            </p>
            <div className="space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                placeholder="タイトル（件名）"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <label className="block text-xs text-zinc-500 dark:text-zinc-400">
                {newCategory === "recipe_vote"
                  ? "レシピページのURL（1行に1件）"
                  : "本文"}
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={newCategory === "recipe_vote" ? 5 : 3}
                  placeholder={
                    newCategory === "recipe_vote"
                      ? "https://cookpad.com/jp/recipes/…"
                      : "本文"
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as BulletinCategory)
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {BULLETIN_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {BULLETIN_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={newImportance}
                  onChange={(e) =>
                    setNewImportance(e.target.value as BulletinImportance)
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="normal">通常</option>
                  <option value="important">重要</option>
                </select>
              </div>
              <BulletinTopicTagsField
                value={newTags}
                onChange={setNewTags}
                disabled={busy !== null}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateTopic}
                  disabled={
                    busy !== null ||
                    !newTitle.trim() ||
                    (newCategory === "recipe_vote"
                      ? parseRecipeUrlLines(newBody).length === 0
                      : !newBody.trim())
                  }
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {busy === "create-topic" ? "作成中…" : "話題を作成"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTopicForm(false);
                    setNewTitle("");
                    setNewBody("");
                    setNewTags([]);
                  }}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 話題一覧 */}
        <div className="bg-white pb-2 pt-1 dark:bg-transparent">
          {topics.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-zinc-400 dark:text-zinc-500">
              まだ話題がありません。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {topics.map(({ id, data, replyCount }) => {
                const showImportant =
                  data.importance === "important" || data.pinned;
                const tags = normalizeBulletinTopicTags(data);
                return (
                  <li key={id}>
                    <Link
                      href={`/groups/${groupId}/bulletin/${id}`}
                      className={`block px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                        showImportant
                          ? "bg-amber-50/60 dark:bg-amber-950/15"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {data.pinned ? (
                            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                              📌 ピン留め
                            </p>
                          ) : null}
                          <h3 className="mt-0.5 text-sm font-medium leading-snug text-zinc-700 dark:text-zinc-300">
                            {data.title}
                          </h3>
                          <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                            {excerptBulletinBody(data)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {BULLETIN_CATEGORY_LABELS[data.category]}
                            </span>
                            {tags.map((t) => (
                              <span
                                key={t}
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  t === "priority_top"
                                    ? "bg-rose-100 font-medium text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                                    : "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                                }`}
                              >
                                {BULLETIN_TOPIC_TAG_LABELS[t]}
                              </span>
                            ))}
                            {data.importance === "important" ? (
                              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                重要
                              </span>
                            ) : null}
                            <span>
                              {data.authorDisplayName ||
                                data.authorUserId.slice(0, 8) + "…"}{" "}
                              · {formatTs(data.createdAt)}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-zinc-400">
                          返信 {replyCount} 件
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
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
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.52 2.52 0 0 1 13 4.5Z" />
              </svg>
              その他で共有
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            メンバー
          </h2>
          {isOwner ? (
            <VisibilityBadge
              kind="owner"
              title="「外す」ボタンはオーナーにのみ表示されます。"
            />
          ) : null}
        </div>
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
                  <span className="ml-1 text-xs text-emerald-600">
                    （あなた）
                  </span>
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

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-8 dark:border-zinc-700">
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
          <>
            <VisibilityBadge kind="owner" />
            <button
              type="button"
              onClick={handleDeleteGroup}
              disabled={busy !== null}
              className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
            >
              {busy === "delete" ? "削除中…" : "旅行を削除"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
