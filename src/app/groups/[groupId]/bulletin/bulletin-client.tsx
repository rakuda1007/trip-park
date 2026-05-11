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
import { useBulletinImagePaste } from "@/hooks/use-bulletin-image-paste";
import { BulletinExpandableBodyField } from "@/components/bulletin/bulletin-expandable-body-field";
import { BulletinImageAttachButton } from "@/components/bulletin/bulletin-image-attach-button";
import { BulletinTopicTagsField } from "@/components/bulletin-topic-tags-field";
import {
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_CATEGORY_OPTIONS,
  BULLETIN_TOPIC_TAG_LABELS,
  type BulletinCategory,
  type BulletinImportance,
  type NearbyMapSpot,
  type BulletinTopicDoc,
  type BulletinTopicTag,
  normalizeBulletinTopicTags,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import { SharingListPanel } from "@/app/groups/[groupId]/sharing/sharing-list-panel";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

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
  if (data.category === "nearby_map" && data.nearbyMapSpots?.length) {
    return `立ち寄り先 ${data.nearbyMapSpots.length}件の周辺地図`;
  }
  const t = data.body
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[画像]")
    .trim()
    .replace(/\s+/g, " ");
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

  const { pasteBulletinImage, insertImageFromFile } = useBulletinImagePaste({
    groupId,
    uid: user?.uid,
    disabled: busy !== null,
    setBusy,
    setError,
  });

  const newBodyRef = useRef<HTMLTextAreaElement>(null);
  const bulletinImgNewTopicId = useId();

  const [showForm, setShowForm] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<BulletinCategory>("general");
  const [newImportance, setNewImportance] =
    useState<BulletinImportance>("normal");
  const [newTags, setNewTags] = useState<BulletinTopicTag[]>([]);
  const [newNearbyMapName, setNewNearbyMapName] = useState("");
  const [newNearbyMapUrl, setNewNearbyMapUrl] = useState("");
  const [newNearbyMapSpots, setNewNearbyMapSpots] = useState<NearbyMapSpot[]>(
    [],
  );

  function isValidMapUrl(url: string): boolean {
    return /^https?:\/\/\S+/i.test(url.trim());
  }

  function addNearbyMapSpot() {
    const name = newNearbyMapName.trim();
    const url = newNearbyMapUrl.trim();
    if (!name || !isValidMapUrl(url)) return;
    setNewNearbyMapSpots((prev) => [...prev, { name, url }]);
    setNewNearbyMapName("");
    setNewNearbyMapUrl("");
  }

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
    if (newCategory !== "recipe_vote" && newCategory !== "nearby_map" && !newBody.trim()) return;
    if (newCategory === "recipe_vote") {
      const urls = parseRecipeUrlLines(newBody);
      if (urls.length === 0) return;
    }
    if (newCategory === "nearby_map" && newNearbyMapSpots.length === 0) return;
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
        newCategory === "nearby_map" ? newNearbyMapSpots : undefined,
        newTags,
      );
      setNewTitle("");
      setNewBody("");
      setNewCategory("general");
      setNewImportance("normal");
      setNewTags([]);
      setNewNearbyMapName("");
      setNewNearbyMapUrl("");
      setNewNearbyMapSpots([]);
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
      <div className="flex items-center justify-between gap-4">
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
            <BulletinExpandableBodyField
              label={
                newCategory === "recipe_vote"
                  ? "レシピページのURL（1行に1件）"
                  : newCategory === "nearby_map"
                    ? "本文（任意）"
                    : "本文（最初の投稿）"
              }
              leadingActions={
                newCategory !== "recipe_vote" ? (
                  <BulletinImageAttachButton
                    inputId={bulletinImgNewTopicId}
                    disabled={busy !== null}
                    onFile={(f) =>
                      void insertImageFromFile(
                        f,
                        newBody,
                        setNewBody,
                        newBodyRef,
                        true,
                      )
                    }
                  />
                ) : null
              }
              textareaRef={newBodyRef}
              value={newBody}
              onChange={setNewBody}
              rows={newCategory === "recipe_vote" ? 6 : 4}
              placeholder={
                newCategory === "recipe_vote"
                  ? "https://cookpad.com/jp/recipes/…"
                  : newCategory === "nearby_map"
                    ? "補足メモ（任意）"
                    : "内容"
              }
              disabled={busy !== null}
              onPaste={(e) =>
                void pasteBulletinImage(
                  e,
                  newBody,
                  setNewBody,
                  newCategory !== "recipe_vote",
                )
              }
            />
            {newCategory === "nearby_map" ? (
              <div className="rounded-md border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
                  立ち寄り先の地図を登録
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="text-xs text-zinc-600 dark:text-zinc-400">
                    場所名
                    <input
                      type="text"
                      value={newNearbyMapName}
                      onChange={(e) => setNewNearbyMapName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例: 道の駅 富楽里"
                    />
                  </label>
                  <label className="text-xs text-zinc-600 dark:text-zinc-400">
                    地図URL
                    <input
                      type="url"
                      value={newNearbyMapUrl}
                      onChange={(e) => setNewNearbyMapUrl(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="https://maps.google.com/..."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addNearbyMapSpot}
                    disabled={!newNearbyMapName.trim() || !isValidMapUrl(newNearbyMapUrl)}
                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    追加
                  </button>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {newNearbyMapSpots.map((spot, idx) => (
                    <li key={`${spot.name}-${idx}`} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-sm dark:bg-zinc-900/70">
                      <span className="truncate text-zinc-700 dark:text-zinc-200">
                        {spot.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewNearbyMapSpots((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-xs text-red-600 hover:underline"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
            <BulletinTopicTagsField
              value={newTags}
              onChange={setNewTags}
              disabled={busy !== null}
            />
            <button
              type="button"
              onClick={handleCreateTopic}
              disabled={
                busy !== null ||
                !newTitle.trim() ||
                (newCategory === "recipe_vote"
                  ? parseRecipeUrlLines(newBody).length === 0
                  : newCategory === "nearby_map"
                    ? newNearbyMapSpots.length === 0
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
              const importantMobileFrame =
                data.importance === "important"
                  ? "max-sm:border-2 max-sm:border-amber-500 max-sm:ring-2 max-sm:ring-amber-400/90 max-sm:shadow-md dark:max-sm:border-amber-500 dark:max-sm:ring-amber-600/55"
                  : "";
              const tags = normalizeBulletinTopicTags(data);
              return (
                <li key={id}>
                  <Link
                    href={`/groups/${groupId}/bulletin/${id}`}
                    className={`block rounded-lg border p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                      showImportant
                        ? "border-amber-300/90 bg-amber-50 shadow-sm ring-1 ring-amber-200/80 dark:border-amber-800/80 dark:bg-amber-950/35 dark:ring-amber-900/50"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
                    } ${importantMobileFrame}`}
                  >
                    {data.importance === "important" ? (
                      <div className="mb-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700">
                        重要トピック
                      </div>
                    ) : null}
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
                      {tags.map((t) => (
                        <span
                          key={t}
                          className={`rounded px-2 py-0.5 ${
                            t === "priority_top"
                              ? "bg-rose-100 font-medium text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                              : "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                          }`}
                        >
                          {BULLETIN_TOPIC_TAG_LABELS[t]}
                        </span>
                      ))}
                      {data.importance === "important" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
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
