"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  createBulletinReply,
  deleteBulletinReply,
  deleteBulletinTopic,
  getBulletinTopic,
  listBulletinReplies,
  setBulletinTopicPinned,
  updateBulletinReply,
  updateBulletinTopic,
} from "@/lib/firestore/bulletin";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import { sendNotification } from "@/lib/notify";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type {
  BulletinCategory,
  BulletinImportance,
  BulletinReplyDoc,
  BulletinTopicDoc,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const CATEGORY_LABELS: Record<BulletinCategory, string> = {
  general: "全体連絡",
  gear: "持ち物",
  dayof: "当日の連絡",
  other: "その他",
};

const CATEGORY_OPTIONS: BulletinCategory[] = [
  "general",
  "gear",
  "dayof",
  "other",
];

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
        return;
      }
      const [m, t, r] = await Promise.all([
        listMembers(groupId),
        getBulletinTopic(groupId, topicId),
        listBulletinReplies(groupId, topicId),
      ]);
      setMembers(m);
      setTopic(t ?? null);
      setReplies(r);
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

  async function handleSaveTopic() {
    if (!groupId || !topicId || !editTitle.trim() || !editBody.trim()) return;
    setBusy("save-topic");
    setError(null);
    try {
      await updateBulletinTopic(
        groupId,
        topicId,
        editTitle,
        editBody,
        editCategory,
        editImportance,
      );
      setEditingTopic(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
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
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <div className="flex flex-wrap gap-4">
              <select
                value={editCategory}
                onChange={(e) =>
                  setEditCategory(e.target.value as BulletinCategory)
                }
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
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
                disabled={busy !== null}
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
                {CATEGORY_LABELS[topic.category]}
              </span>
              {topic.importance === "important" ? (
                <span className="text-amber-700 dark:text-amber-300">重要</span>
              ) : null}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {topic.body}
            </p>
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
          {replies.map(({ id, data }) => {
            const isOwn = user?.uid === data.authorUserId;
            const label =
              data.authorDisplayName ||
              data.authorUserId.slice(0, 8) + "…";
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
