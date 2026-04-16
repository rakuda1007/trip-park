"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  clearAllRecipeVotes,
  computeReplyReadCounts,
  createBulletinReply,
  deleteBulletinReply,
  deleteBulletinTopic,
  getBulletinTopic,
  listBulletinReplies,
  listRecipeVotes,
  listTopicReplyReadProgress,
  setBulletinTopicPinned,
  setMyRecipeVote,
  setMyTopicReplyReadProgress,
  updateBulletinReply,
  updateBulletinTopic,
} from "@/lib/firestore/bulletin";
import { fetchRecipePollFromUrls } from "@/lib/recipe-preview-api";
import {
  normalizeUrlListSignature,
  parseRecipeUrlLines,
} from "@/lib/recipe-url-input";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import { sendNotification } from "@/lib/notify";
import type { GroupDoc, MemberDoc } from "@/types/group";
import {
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_CATEGORY_OPTIONS,
  type BulletinCategory,
  type BulletinImportance,
  type BulletinReplyDoc,
  type BulletinTopicDoc,
  type BulletinRecipeVoteDoc,
  type RecipePollData,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function isUpdatedTopic(data: BulletinTopicDoc): boolean {
  const u = data.updatedAt;
  const c = data.createdAt;
  if (!u || !c) return false;
  if (u instanceof Timestamp && c instanceof Timestamp) {
    return u.seconds !== c.seconds || u.nanoseconds !== c.nanoseconds;
  }
  return u !== c;
}

function isUpdatedReply(data: BulletinReplyDoc): boolean {
  const u = data.updatedAt;
  const c = data.createdAt;
  if (!u || !c) return false;
  if (u instanceof Timestamp && c instanceof Timestamp) {
    return u.seconds !== c.seconds || u.nanoseconds !== c.nanoseconds;
  }
  return u !== c;
}

function canManageBulletin(
  group: GroupDoc,
  members: { userId: string; data: MemberDoc }[],
  uid: string,
): boolean {
  if (group.ownerId === uid) return true;
  const m = members.find((x) => x.userId === uid);
  return m?.data.role === "admin";
}

export function BulletinTopicClient() {
  const params = useParams();
  const groupId = useGroupRouteId();
  const topicId = params.topicId as string;
  const { user } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [topic, setTopic] = useState<BulletinTopicDoc | null | undefined>(
    undefined,
  );
  const [replies, setReplies] = useState<
    { id: string; data: BulletinReplyDoc }[]
  >([]);
  const [replyReads, setReplyReads] = useState<
    { userId: string; lastReadReplyId: string | null }[]
  >([]);
  const [recipeVotes, setRecipeVotes] = useState<
    { userId: string; data: BulletinRecipeVoteDoc }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingTopic, setEditingTopic] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState<BulletinCategory>("general");
  const [editImportance, setEditImportance] =
    useState<BulletinImportance>("normal");

  const [newReplyBody, setNewReplyBody] = useState("");

  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyBody, setEditReplyBody] = useState("");

  const load = useCallback(async () => {
    if (!groupId || !topicId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (!g) {
        setMembers([]);
        setTopic(null);
        setReplies([]);
        setReplyReads([]);
        return;
      }
      const [m, t, r, reads, rv] = await Promise.all([
        listMembers(groupId),
        getBulletinTopic(groupId, topicId),
        listBulletinReplies(groupId, topicId),
        listTopicReplyReadProgress(groupId, topicId).catch(() => []),
        listRecipeVotes(groupId, topicId).catch(() => []),
      ]);
      setMembers(m);
      setTopic(t ?? null);
      setReplies(r);
      setReplyReads(reads);
      setRecipeVotes(rv);
      if (t) {
        setEditTitle(t.title);
        setEditBody(t.body);
        setEditCategory(t.category);
        setEditImportance(t.importance);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
      setTopic(null);
      setReplyReads([]);
    }
  }, [groupId, topicId]);

  useEffect(() => {
    load();
  }, [load]);

  const isMember = Boolean(
    user && members.some((x) => x.userId === user.uid),
  );
  const canManage =
    user && group ? canManageBulletin(group, members, user.uid) : false;

  const replyReadCounts = useMemo(
    () =>
      computeReplyReadCounts(
        replies.map((x) => x.id),
        replyReads,
      ),
    [replies, replyReads],
  );

  const recipeVoteTally = useMemo(() => {
    const n = topic?.recipePoll?.candidates.length ?? 0;
    const counts: number[] = Array.from({ length: n }, () => 0);
    if (!topic || topic.category !== "recipe_vote") return counts;
    for (const { data } of recipeVotes) {
      const i = data.candidateIndex;
      if (i >= 0 && i < n) counts[i]++;
    }
    return counts;
  }, [topic, recipeVotes]);

  const myRecipeVoteIndex = useMemo(() => {
    if (!user) return null;
    return (
      recipeVotes.find((x) => x.userId === user.uid)?.data.candidateIndex ??
      null
    );
  }, [recipeVotes, user]);

  const lastReplyId = replies.length > 0 ? replies[replies.length - 1]!.id : null;

  useEffect(() => {
    if (!groupId || !topicId || !user?.uid || !isMember || !lastReplyId) return;
    const timer = setTimeout(() => {
      void setMyTopicReplyReadProgress(
        groupId,
        topicId,
        user.uid,
        lastReplyId,
      ).then(() =>
        listTopicReplyReadProgress(groupId, topicId).then(setReplyReads),
      );
    }, 450);
    return () => clearTimeout(timer);
  }, [groupId, topicId, user?.uid, isMember, lastReplyId]);

  async function handleSaveTopic() {
    if (!groupId || !topicId || !topic || !editTitle.trim()) return;
    if (editCategory !== "recipe_vote" && !editBody.trim()) return;
    if (editCategory === "recipe_vote" && parseRecipeUrlLines(editBody).length === 0) {
      return;
    }
    setBusy("save-topic");
    setError(null);
    try {
      let recipePoll: RecipePollData | null = null;
      if (editCategory === "recipe_vote") {
        const urls = parseRecipeUrlLines(editBody);
        const nextSig = normalizeUrlListSignature(urls);
        const prevSig = normalizeUrlListSignature(parseRecipeUrlLines(topic.body));
        const reusePreview =
          topic.category === "recipe_vote" &&
          nextSig === prevSig &&
          topic.recipePoll?.candidates &&
          topic.recipePoll.candidates.length === urls.length;
        if (reusePreview && topic.recipePoll) {
          recipePoll = topic.recipePoll;
        } else {
          if (topic.category === "recipe_vote") {
            await clearAllRecipeVotes(groupId, topicId);
          }
          recipePoll = await fetchRecipePollFromUrls(urls);
        }
      } else if (topic.category === "recipe_vote") {
        await clearAllRecipeVotes(groupId, topicId);
      }

      await updateBulletinTopic(
        groupId,
        topicId,
        editTitle,
        editBody,
        editCategory,
        editImportance,
        recipePoll,
      );
      setEditingTopic(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleRecipeVote(candidateIndex: number) {
    if (!user || !groupId || !topicId || !topic || !isMember) return;
    if (topic.category !== "recipe_vote" || !topic.recipePoll?.candidates.length) {
      return;
    }
    if (
      candidateIndex < 0 ||
      candidateIndex >= topic.recipePoll.candidates.length
    ) {
      return;
    }
    setBusy("vote");
    setError(null);
    try {
      await setMyRecipeVote(groupId, topicId, user.uid, candidateIndex);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "投票に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteTopic() {
    if (!groupId) return;
    if (!confirm("この話題とすべての返信を削除しますか？")) return;
    setBusy("del-topic");
    setError(null);
    try {
      await deleteBulletinTopic(groupId, topicId);
      router.push(`/groups/${groupId}/bulletin`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleTogglePin() {
    if (!groupId || !topic) return;
    setBusy("pin");
    setError(null);
    try {
      await setBulletinTopicPinned(groupId, topicId, !topic.pinned);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ピン留めの更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateReply() {
    if (!user || !groupId || !newReplyBody.trim()) return;
    setBusy("reply");
    setError(null);
    try {
      await createBulletinReply(
        groupId,
        topicId,
        user.uid,
        user.displayName,
        newReplyBody,
      );
      setNewReplyBody("");
      await load();
      // 話題の作者に通知（自分でなければ）
      if (topic && topic.authorUserId !== user.uid) {
        sendNotification({
          type: "bulletin_reply",
          groupId,
          groupName: group?.name ?? "",
          topicId,
          topicTitle: topic.title,
          authorName: user.displayName ?? "メンバー",
          authorUid: user.uid,
          topicAuthorUid: topic.authorUserId,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "返信に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveReply(replyId: string) {
    if (!groupId || !editReplyBody.trim()) return;
    setBusy(`save-reply-${replyId}`);
    setError(null);
    try {
      await updateBulletinReply(groupId, topicId, replyId, editReplyBody);
      setEditingReplyId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteReply(replyId: string) {
    if (!groupId) return;
    if (!confirm("この返信を削除しますか？")) return;
    setBusy(`del-reply-${replyId}`);
    setError(null);
    try {
      await deleteBulletinReply(groupId, topicId, replyId);
      if (editingReplyId === replyId) setEditingReplyId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  if (group === undefined || topic === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }

  if (group === null || topic === null) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">話題が見つかりません。</p>
        <Link
          href={`/groups/${groupId}/bulletin`}
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
          トピック一覧へ
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
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
          グループ詳細へ
        </Link>
      </div>
    );
  }

  const isTopicAuthor = user?.uid === topic.authorUserId;
  const showImportant = topic.importance === "important" || topic.pinned;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}/bulletin`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← トピック一覧
      </Link>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <article
        className={`mt-6 rounded-xl border p-3 sm:p-4 ${
          showImportant
            ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/25"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
        }`}
      >
        {topic.pinned ? (
          <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            📌 ピン留め
          </p>
        ) : null}

        {editingTopic ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <label className="block text-xs text-zinc-500">
              {editCategory === "recipe_vote"
                ? "レシピページのURL（1行に1件）"
                : "本文"}
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={editCategory === "recipe_vote" ? 8 : 8}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                placeholder={
                  editCategory === "recipe_vote"
                    ? "https://…"
                    : undefined
                }
              />
            </label>
            <div className="flex flex-wrap gap-4">
              <select
                value={editCategory}
                onChange={(e) =>
                  setEditCategory(e.target.value as BulletinCategory)
                }
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {BULLETIN_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {BULLETIN_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <select
                value={editImportance}
                onChange={(e) =>
                  setEditImportance(e.target.value as BulletinImportance)
                }
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value="normal">通常</option>
                <option value="important">重要</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveTopic}
                disabled={
                  busy !== null ||
                  !editTitle.trim() ||
                  (editCategory === "recipe_vote"
                    ? parseRecipeUrlLines(editBody).length === 0
                    : !editBody.trim())
                }
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTopic(false);
                  setEditTitle(topic.title);
                  setEditBody(topic.body);
                  setEditCategory(topic.category);
                  setEditImportance(topic.importance);
                }}
                disabled={busy !== null}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50 sm:text-xl">
              {topic.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-zinc-500">
              <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                {BULLETIN_CATEGORY_LABELS[topic.category]}
              </span>
              {topic.importance === "important" ? (
                <span className="text-amber-700 dark:text-amber-300">重要</span>
              ) : null}
            </div>
            {topic.category === "recipe_vote" &&
            topic.recipePoll?.candidates?.length ? (
              <div className="mt-4 space-y-4">
                <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  候補を比較
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {topic.recipePoll.candidates.map((c, idx) => {
                    const tally = recipeVoteTally[idx] ?? 0;
                    const label = c.sourceTitle || c.url;
                    const selected = myRecipeVoteIndex === idx;
                    return (
                      <div
                        key={`${c.url}-${idx}`}
                        className={`flex flex-col overflow-hidden rounded-xl border bg-zinc-50/80 dark:bg-zinc-900/50 ${
                          selected
                            ? "border-emerald-500 ring-1 ring-emerald-500/30"
                            : "border-zinc-200 dark:border-zinc-600"
                        }`}
                      >
                        {c.imageUrl ? (
                          <div className="relative aspect-[4/3] w-full bg-zinc-200 dark:bg-zinc-800">
                            <img
                              src={c.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-[4/3] items-center justify-center bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-800">
                            画像なし
                          </div>
                        )}
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <p className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                            {label}
                          </p>
                          {c.fetchError ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              {c.fetchError}
                            </p>
                          ) : null}
                          {c.ingredients.length > 0 ? (
                            <div>
                              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                材料
                              </p>
                              <ul className="mt-1 max-h-36 list-inside list-disc overflow-y-auto text-xs text-zinc-700 dark:text-zinc-300">
                                {c.ingredients.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">
                              材料リストを取得できませんでした（サイトによる）
                            </p>
                          )}
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                            <span className="text-xs text-zinc-500">
                              票 {tally}
                            </span>
                            <div className="flex gap-2">
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                              >
                                レシピを開く
                              </a>
                              {user && isMember ? (
                                <button
                                  type="button"
                                  onClick={() => handleRecipeVote(idx)}
                                  disabled={busy !== null}
                                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                                    selected
                                      ? "bg-emerald-600 text-white"
                                      : "border border-zinc-300 bg-white text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                  }`}
                                >
                                  {selected ? "投票済み" : "投票する"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <details className="text-xs text-zinc-500">
                  <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
                    登録したURL一覧
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-zinc-100 p-2 text-[11px] dark:bg-zinc-800">
                    {topic.body}
                  </pre>
                </details>
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {topic.body}
              </p>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">
              {topic.authorDisplayName ||
                topic.authorUserId.slice(0, 8) + "…"}{" "}
              · {formatTs(topic.createdAt)}
              {isUpdatedTopic(topic) ? (
                <span>（更新: {formatTs(topic.updatedAt)}）</span>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isTopicAuthor ? (
                <button
                  type="button"
                  onClick={() => setEditingTopic(true)}
                  disabled={busy !== null}
                  className="text-xs text-zinc-700 underline dark:text-zinc-300"
                >
                  編集
                </button>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  onClick={handleTogglePin}
                  disabled={busy !== null}
                  className="text-xs text-amber-800 underline dark:text-amber-200"
                >
                  {topic.pinned ? "ピンを外す" : "ピン留め"}
                </button>
              ) : null}
              {(isTopicAuthor || canManage) && (
                <button
                  type="button"
                  onClick={handleDeleteTopic}
                  disabled={busy !== null}
                  className="text-xs text-red-600 underline"
                >
                  話題を削除
                </button>
              )}
            </div>
          </>
        )}
      </article>

      {/* 返信（LINE風バブル：自分＝右・他人＝左） */}
      <section className="mt-5" aria-label="返信スレッド">
        <p className="mb-2 text-center text-[11px] text-zinc-400">
          返信 {replies.length} 件
        </p>
        <ul className="space-y-3">
          {replies.map(({ id, data }, idx) => {
            const isOwn = user?.uid === data.authorUserId;
            const label =
              data.authorDisplayName ||
              data.authorUserId.slice(0, 8) + "…";
            const readCount = replyReadCounts[idx] ?? 0;
            return (
              <li
                key={id}
                className={isOwn ? "flex justify-end" : "flex justify-start"}
              >
                <div className="max-w-[min(85%,22rem)]">
                  {editingReplyId === id ? (
                    <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-600 dark:bg-zinc-900/80">
                      <textarea
                        value={editReplyBody}
                        onChange={(e) => setEditReplyBody(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                      />
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveReply(id)}
                          disabled={busy !== null}
                          className="text-xs font-medium text-zinc-900 underline dark:text-zinc-100"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingReplyId(null)}
                          disabled={busy !== null}
                          className="text-xs text-zinc-500"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                          isOwn
                            ? "rounded-br-sm bg-emerald-600 text-white dark:bg-emerald-700"
                            : "rounded-bl-sm bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {data.body}
                        </p>
                      </div>
                      <p
                        className={`mt-1 text-[10px] leading-tight text-zinc-400 ${
                          isOwn ? "text-right" : "text-left"
                        }`}
                      >
                        {label} · {formatTs(data.createdAt)}
                        {isUpdatedReply(data) ? (
                          <span>（更新 {formatTs(data.updatedAt)}）</span>
                        ) : null}
                        <span className="text-zinc-500"> · 既読 {readCount}</span>
                      </p>
                      <div
                        className={`mt-0.5 flex gap-2 ${
                          isOwn ? "justify-end" : "justify-start"
                        }`}
                      >
                        {isOwn ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReplyId(id);
                              setEditReplyBody(data.body);
                            }}
                            disabled={busy !== null}
                            className="text-[11px] text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                          >
                            編集
                          </button>
                        ) : null}
                        {(isOwn || canManage) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteReply(id)}
                            disabled={busy !== null}
                            className="text-[11px] text-red-500 underline hover:text-red-700"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {user && isMember ? (
          <div className="mt-4 flex items-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <textarea
              value={newReplyBody}
              onChange={(e) => setNewReplyBody(e.target.value)}
              rows={1}
              className="min-h-[42px] flex-1 resize-none rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-snug placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              placeholder="メッセージを入力…"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (newReplyBody.trim() && busy === null) void handleCreateReply();
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreateReply}
              disabled={busy !== null || !newReplyBody.trim()}
              className="shrink-0 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {busy === "reply" ? "…" : "送信"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
