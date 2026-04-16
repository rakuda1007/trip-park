"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  createBulletinTopic,
  listBulletinTopicsWithReplyCounts,
} from "@/lib/firestore/bulletin";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import { sendNotification } from "@/lib/notify";
import {
  listSharingItems,
  sharingSummaryStats,
  type SharingItemRow,
} from "@/lib/firestore/sharing";
import type { GroupDoc, MemberDoc } from "@/types/group";
import { fetchRecipePollFromUrls } from "@/lib/recipe-preview-api";
import { parseRecipeUrlLines } from "@/lib/recipe-url-input";
import {
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_CATEGORY_OPTIONS,
  type BulletinCategory,
  type BulletinImportance,
  type BulletinTopicDoc,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import { SharingListPanel } from "@/app/groups/[groupId]/sharing/sharing-list-panel";
import Link from "next/link";
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

function excerptTopic(data: BulletinTopicDoc, max = 120): string {
  if (data.category === "recipe_vote" && data.recipePoll?.candidates?.length) {
    return `候補 ${data.recipePoll.candidates.length}件のレシピ投票`;
  }
  const t = data.body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

export function BulletinClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [topics, setTopics] = useState<
    { id: string; data: BulletinTopicDoc; replyCount: number }[]
  >([]);
  const [sharingItems, setSharingItems] = useState<SharingItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<BulletinCategory>("general");
  const [newImportance, setNewImportance] =
    useState<BulletinImportance>("normal");

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      if (!g) {
        setGroup(null);
        setMembers([]);
        setTopics([]);
        setSharingItems([]);
        return;
      }
      setGroup(g);
      try {
        setMembers(await listMembers(groupId));
      } catch {
        setError("メンバー一覧を読み込めませんでした。");
        setMembers([]);
        setTopics([]);
        setSharingItems([]);
        return;
      }
      try {
        setTopics(await listBulletinTopicsWithReplyCounts(groupId));
      } catch {
        setTopics([]);
      }
      try {
        setSharingItems(await listSharingItems(groupId));
      } catch {
        setSharingItems([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const isMember = Boolean(
    user && members.some((x) => x.userId === user.uid),
  );

  async function handleCreateTopic() {
    if (!user || !groupId || !newTitle.trim()) return;
    if (newCategory !== "recipe_vote" && !newBody.trim()) return;
    if (newCategory === "recipe_vote") {
      const urls = parseRecipeUrlLines(newBody);
      if (urls.length === 0) return;
    }
    setBusy("create");
    setError(null);
    try {
      const savedTitle = newTitle.trim();
      let recipePoll = null;
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
      );
      setNewTitle("");
      setNewBody("");
      setNewCategory("general");
      setNewImportance("normal");
      setShowForm(false);
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
        <Link
          href="/groups"
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
          グループ一覧へ
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

  const shareStat = sharingSummaryStats(sharingItems);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← {group.name}
      </Link>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            掲示板
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            トピック
          </h1>
        </div>
        {user && isMember ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {showForm ? "× キャンセル" : "+ 新しい話題"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        トピックごとにチャットでやりとりできます。
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShoppingOpen((o) => !o)}
          aria-expanded={shoppingOpen}
          aria-controls="bulletin-sharing-panel"
          className="text-left text-sm text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <span className="select-none" aria-hidden>
            {shoppingOpen ? "▼" : "▶"}
          </span>
          買出しリスト（全{shareStat.total}項目、未割当{shareStat.unassigned}項目）
        </button>
        {shoppingOpen ? (
          <div
            id="bulletin-sharing-panel"
            role="region"
            className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
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

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {/* 新しい話題フォーム（ボタンを押したときだけ表示） */}
      {showForm && user && isMember ? (
        <section className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            新しい話題を立てる
          </h2>
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              タイトル
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="件名"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              {newCategory === "recipe_vote"
                ? "レシピページのURL（1行に1件）"
                : "本文（最初の投稿）"}
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={newCategory === "recipe_vote" ? 6 : 5}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder={
                  newCategory === "recipe_vote"
                    ? "https://cookpad.com/jp/recipes/…"
                    : "内容"
                }
              />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">
                カテゴリ
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as BulletinCategory)
                  }
                  className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {BULLETIN_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {BULLETIN_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-zinc-600 dark:text-zinc-400">
                重要度
                <select
                  value={newImportance}
                  onChange={(e) =>
                    setNewImportance(e.target.value as BulletinImportance)
                  }
                  className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="normal">通常</option>
                  <option value="important">重要</option>
                </select>
              </label>
            </div>
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
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {busy === "create" ? "作成中…" : "話題を作成"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-8 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
          話題一覧
        </h2>
        {topics.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            まだ話題がありません。「＋ 新しい話題」ボタンから最初の話題を作成してください。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {topics.map(({ id, data, replyCount }) => {
              const showImportant =
                data.importance === "important" || data.pinned;
              return (
                <li key={id}>
                  <Link
                    href={`/groups/${groupId}/bulletin/${id}`}
                    className={`block rounded-lg border p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                      showImportant
                        ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/25"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
                    }`}
                  >
                    {data.pinned ? (
                      <p className="mb-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                        📌 ピン留め
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                        {data.title}
                      </h3>
                      <span className="shrink-0 text-xs text-zinc-500">
                        返信 {replyCount} 件
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {excerptTopic(data)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                        {BULLETIN_CATEGORY_LABELS[data.category]}
                      </span>
                      {data.importance === "important" ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          重要
                        </span>
                      ) : null}
                      <span>
                        {data.authorDisplayName ||
                          data.authorUserId.slice(0, 8) + "…"}{" "}
                        · {formatTs(data.createdAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
