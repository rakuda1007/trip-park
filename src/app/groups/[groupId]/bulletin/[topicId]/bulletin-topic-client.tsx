"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  clearAllRecipeVotes,
  computeReplyReadCounts,
  computeTopicOpenReadCount,
  createBulletinReply,
  deleteBulletinReply,
  deleteBulletinTopic,
  getBulletinTopic,
  listBulletinReplies,
  listRecipeVotes,
  listTopicReplyReadProgress,
  setBulletinTopicPinned,
  setMyRecipeRatings,
  setMyTopicReplyReadProgress,
  updateBulletinReply,
  updateBulletinTopic,
  updateRecipePollResolution,
} from "@/lib/firestore/bulletin";
import { fetchRecipePollFromUrls } from "@/lib/recipe-preview-api";
import {
  competitionRanksForTotals,
  countRatedCandidates,
  normalizeRecipeRatings,
  validateRecipeRatings,
} from "@/lib/recipe-vote";
import {
  normalizeUrlListSignature,
  parseRecipeUrlLines,
} from "@/lib/recipe-url-input";
import { calcTripNumDays } from "@/lib/trip-dates";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import { shareBulletinTopicPreferred } from "@/lib/bulletin-share";
import { sendNotification } from "@/lib/notify";
import type { GroupDoc, MemberDoc } from "@/types/group";
import { BulletinImageAttachButton } from "@/components/bulletin/bulletin-image-attach-button";
import { BulletinRichBody } from "@/components/bulletin/bulletin-rich-body";
import {
  NearbyMapTopicDisplay,
  formatNearbyMapTopicHeadingTitle,
} from "@/components/bulletin/nearby-map-topic-display";
import { BulletinTopicTagsField } from "@/components/bulletin-topic-tags-field";
import { VisibilityBadge } from "@/components/visibility-badge";
import {
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_CATEGORY_OPTIONS,
  BULLETIN_TOPIC_TAG_LABELS,
  type BulletinCategory,
  type BulletinImportance,
  type BulletinReplyDoc,
  type BulletinTopicDoc,
  type BulletinRecipeVoteDoc,
  type BulletinTopicTag,
  type NearbyMapSpot,
  type RecipePollData,
  RECIPE_MEAL_LABELS,
  type RecipeMealSlot,
  normalizeBulletinTopicTags,
} from "@/types/bulletin";
import { serverTimestamp, Timestamp } from "firebase/firestore";
import { useBulletinImagePaste } from "@/hooks/use-bulletin-image-paste";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

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

function memberDisplayName(
  userId: string,
  members: { userId: string; data: MemberDoc }[],
): string {
  const m = members.find((x) => x.userId === userId);
  const d = m?.data.displayName?.trim();
  if (d) return d;
  return `${userId.slice(0, 6)}…`;
}

function isValidMapUrl(url: string): boolean {
  return /^https?:\/\/\S+/i.test(url.trim());
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
  /** LINE共有・プッシュ再通知用の一言 */
  const [remindComment, setRemindComment] = useState("");

  const [editingTopic, setEditingTopic] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState<BulletinCategory>("general");
  const [editImportance, setEditImportance] =
    useState<BulletinImportance>("normal");
  const [editTags, setEditTags] = useState<BulletinTopicTag[]>([]);
  const [editNearbyMapName, setEditNearbyMapName] = useState("");
  const [editNearbyMapUrl, setEditNearbyMapUrl] = useState("");
  const [editNearbyMapSpots, setEditNearbyMapSpots] = useState<NearbyMapSpot[]>(
    [],
  );

  const [newReplyBody, setNewReplyBody] = useState("");

  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyBody, setEditReplyBody] = useState("");

  /** レシピ投票: 自分の評価ドラフト（候補ごと 0〜5） */
  const [draftRatings, setDraftRatings] = useState<number[]>([]);
  /** 候補ごとの旅程割当（null = 旅程に出さない） */
  const [resolutionPerCandidate, setResolutionPerCandidate] = useState<
    Array<{ dayNumber: number; meal: RecipeMealSlot } | null>
  >([]);
  /** 各候補の「旅程に反映」ボタンを隠す（保存直後〜「旅程に表示しない」まで） */
  const [reflectButtonHidden, setReflectButtonHidden] = useState<
    Record<number, boolean>
  >({});

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInnerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const replyComposerRef = useRef<HTMLTextAreaElement>(null);
  const editTopicBodyRef = useRef<HTMLTextAreaElement>(null);
  const editReplyBodyRef = useRef<HTMLTextAreaElement>(null);
  const bulletinImgReplyId = useId();
  const bulletinImgTopicId = useId();
  const bulletinImgReplyEditId = useId();

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
        setEditTags(normalizeBulletinTopicTags(t));
        setEditNearbyMapSpots(t.nearbyMapSpots ?? []);
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

  const { pasteBulletinImage, insertImageFromFile } = useBulletinImagePaste({
    groupId,
    uid: user?.uid,
    disabled: busy !== null,
    setBusy,
    setError,
  });

  const replyReadCounts = useMemo(
    () =>
      computeReplyReadCounts(
        replies.map((x) => x.id),
        replyReads,
      ),
    [replies, replyReads],
  );

  const topicOpenReadCount = useMemo(
    () =>
      computeTopicOpenReadCount(
        replies.map((x) => x.id),
        replyReads,
      ),
    [replies, replyReads],
  );

  const recipeScoreTotals = useMemo(() => {
    const n = topic?.recipePoll?.candidates.length ?? 0;
    const sums: number[] = Array.from({ length: n }, () => 0);
    if (!topic || topic.category !== "recipe_vote") return sums;
    for (const { data } of recipeVotes) {
      const r = normalizeRecipeRatings(data, n);
      for (let j = 0; j < n; j++) sums[j] += r[j] ?? 0;
    }
    return sums;
  }, [topic, recipeVotes]);

  /** 「旅程に反映」エリアの候補の並び: 合計点の高い順（同点は候補の登録順） */
  const recipeJourneyOrderIndices = useMemo(() => {
    const n = topic?.recipePoll?.candidates.length ?? 0;
    if (n === 0) return [];
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => {
      const ta = recipeScoreTotals[a] ?? 0;
      const tb = recipeScoreTotals[b] ?? 0;
      if (tb !== ta) return tb - ta;
      return a - b;
    });
    return order;
  }, [topic?.recipePoll?.candidates.length, recipeScoreTotals]);

  /** 合計点が同じ候補は同じ順位（1位が2件なら次は3位） */
  const recipePollCompetitionRanks = useMemo(
    () =>
      competitionRanksForTotals(recipeJourneyOrderIndices, recipeScoreTotals),
    [recipeJourneyOrderIndices, recipeScoreTotals],
  );

  const nCandidates = topic?.recipePoll?.candidates.length ?? 0;

  /** 管理者向け: 1点以上付けて保存した人・未投票メンバー */
  const recipeVoteAdminSummary = useMemo(() => {
    if (!topic || topic.category !== "recipe_vote" || nCandidates === 0) {
      return null;
    }
    type VotedRow = { userId: string; ratedCount: number };
    const voted: VotedRow[] = [];
    for (const { userId, data } of recipeVotes) {
      const r = normalizeRecipeRatings(data, nCandidates);
      const cnt = countRatedCandidates(r);
      if (cnt > 0) voted.push({ userId, ratedCount: cnt });
    }
    voted.sort((a, b) =>
      memberDisplayName(a.userId, members).localeCompare(
        memberDisplayName(b.userId, members),
        "ja",
      ),
    );
    const votedIds = new Set(voted.map((v) => v.userId));
    const memberUidSet = new Set(members.map((m) => m.userId));
    const notVoted = members
      .filter((m) => !votedIds.has(m.userId))
      .map((m) => m.userId)
      .sort((a, b) =>
        memberDisplayName(a, members).localeCompare(
          memberDisplayName(b, members),
          "ja",
        ),
      );
    const extraVoters = voted.filter((v) => !memberUidSet.has(v.userId));
    return { voted, notVoted, extraVoters };
  }, [topic, recipeVotes, members, nCandidates]);

  useEffect(() => {
    if (!user || !topic || topic.category !== "recipe_vote" || nCandidates === 0) {
      setDraftRatings([]);
      return;
    }
    const mine = recipeVotes.find((x) => x.userId === user.uid);
    if (mine) {
      setDraftRatings(normalizeRecipeRatings(mine.data, nCandidates));
    } else {
      setDraftRatings(Array.from({ length: nCandidates }, () => 0));
    }
  }, [topic, recipeVotes, user, nCandidates]);

  useEffect(() => {
    const n = topic?.recipePoll?.candidates?.length ?? 0;
    if (n === 0) {
      setResolutionPerCandidate([]);
      return;
    }
    const a = topic?.recipePollResolution?.assignments;
    const next: Array<{ dayNumber: number; meal: RecipeMealSlot } | null> =
      Array.from({ length: n }, () => null);
    if (a?.length) {
      for (const x of a) {
        if (x.candidateIndex >= 0 && x.candidateIndex < n) {
          next[x.candidateIndex] = {
            dayNumber: x.dayNumber,
            meal: x.meal,
          };
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        next[i] = { dayNumber: 1, meal: "dinner" };
      }
    }
    setResolutionPerCandidate(next);
  }, [topic?.recipePollResolution, topic?.recipePoll?.candidates, nCandidates]);

  /** サーバの確定済み割当に合わせて「反映済みでボタン非表示」を同期 */
  useEffect(() => {
    const n = topic?.recipePoll?.candidates.length ?? 0;
    if (n === 0) {
      setReflectButtonHidden({});
      return;
    }
    const next: Record<number, boolean> = {};
    for (const a of topic?.recipePollResolution?.assignments ?? []) {
      if (a.candidateIndex >= 0 && a.candidateIndex < n) {
        next[a.candidateIndex] = true;
      }
    }
    setReflectButtonHidden(next);
  }, [topicId, topic?.recipePollResolution, topic?.recipePoll?.candidates.length]);

  const scrollChatToBottom = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  /** レシピ投票以外: 末尾（最新返信）へ。描画直後と返信変化のたびに実行 */
  useLayoutEffect(() => {
    if (!topic || editingTopic || topic.category === "recipe_vote") return;
    scrollChatToBottom();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollChatToBottom();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [topicId, topic?.category, replies.length, editingTopic, scrollChatToBottom]);

  /** 返信DOMの高さ変化（長文・折り返し）でも末尾に追従 */
  useEffect(() => {
    if (!topic || editingTopic || topic.category === "recipe_vote") return;
    const inner = chatInnerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      scrollChatToBottom();
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [topicId, topic?.category, replies.length, editingTopic, topic, scrollChatToBottom]);

  /** fixed チャット表示時は背面のページスクロールを止める（モバイルでタイトル・入力が流れないように） */
  useEffect(() => {
    if (!topic || editingTopic || topic.category === "recipe_vote") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [topic, editingTopic, topic?.category]);

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
    if (editCategory !== "recipe_vote" && editCategory !== "nearby_map" && !editBody.trim()) return;
    if (editCategory === "recipe_vote" && parseRecipeUrlLines(editBody).length === 0) {
      return;
    }
    if (editCategory === "nearby_map" && editNearbyMapSpots.length === 0) {
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
            await updateRecipePollResolution(groupId, topicId, null);
          }
          recipePoll = await fetchRecipePollFromUrls(urls);
        }
      } else if (topic.category === "recipe_vote") {
        await clearAllRecipeVotes(groupId, topicId);
        await updateRecipePollResolution(groupId, topicId, null);
      }

      await updateBulletinTopic(
        groupId,
        topicId,
        editTitle,
        editBody,
        editCategory,
        editImportance,
        recipePoll,
        editCategory === "nearby_map" ? editNearbyMapSpots : undefined,
        editTags,
      );
      setEditingTopic(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function addEditNearbyMapSpot() {
    const name = editNearbyMapName.trim();
    const url = editNearbyMapUrl.trim();
    if (!name || !isValidMapUrl(url)) return;
    setEditNearbyMapSpots((prev) => [...prev, { name, url }]);
    setEditNearbyMapName("");
    setEditNearbyMapUrl("");
  }

  function setDraftRatingAt(index: number, score: number) {
    setDraftRatings((prev) => {
      const n = topic?.recipePoll?.candidates.length ?? 0;
      if (n === 0) return prev;
      const next = [...(prev.length === n ? prev : Array.from({ length: n }, () => 0))];
      if (score === 0) {
        next[index] = 0;
        return next;
      }
      if (score >= 1 && score <= 5) {
        for (let j = 0; j < n; j++) {
          if (j !== index && next[j] === score) {
            next[j] = 0;
          }
        }
        next[index] = score;
      }
      return next;
    });
  }

  async function handleSaveMyRatings() {
    if (!user || !groupId || !topicId || !topic || !isMember) return;
    const n = topic.recipePoll?.candidates.length ?? 0;
    if (n === 0 || draftRatings.length !== n) return;
    const err = validateRecipeRatings(draftRatings);
    if (err) {
      setError(err);
      return;
    }
    setBusy("vote");
    setError(null);
    try {
      await setMyRecipeRatings(groupId, topicId, user.uid, draftRatings);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "投票の保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function patchCandidateResolution(
    candidateIndex: number,
    slot: { dayNumber: number; meal: RecipeMealSlot } | null,
  ) {
    setResolutionPerCandidate((prev) => {
      const n = topic?.recipePoll?.candidates.length ?? 0;
      if (n === 0) return prev;
      const next = [
        ...(prev.length === n ? prev : Array.from({ length: n }, () => null)),
      ];
      next[candidateIndex] = slot;
      return next;
    });
    if (slot === null) {
      setReflectButtonHidden((prev) => ({ ...prev, [candidateIndex]: false }));
    }
  }

  /** この候補だけをサーバの割当にマージして保存（他候補の既存確定は維持） */
  async function handleConfirmResolution(ci: number) {
    if (!user || !groupId || !topicId || !topic?.recipePoll?.candidates.length) {
      return;
    }
    const n = topic.recipePoll.candidates.length;
    if (ci < 0 || ci >= n) return;

    const prevAssignments = topic.recipePollResolution?.assignments ?? [];
    const byIdx = new Map(
      prevAssignments.map((a) => [a.candidateIndex, a]),
    );
    const slot = resolutionPerCandidate[ci];
    if (slot && slot.dayNumber >= 1) {
      byIdx.set(ci, {
        candidateIndex: ci,
        dayNumber: slot.dayNumber,
        meal: slot.meal,
      });
    } else {
      byIdx.delete(ci);
    }
    const assignments = Array.from(byIdx.values()).sort(
      (a, b) => a.candidateIndex - b.candidateIndex,
    );

    setBusy(`res-${ci}`);
    setError(null);
    try {
      if (assignments.length === 0) {
        await updateRecipePollResolution(groupId, topicId, null);
      } else {
        await updateRecipePollResolution(groupId, topicId, {
          confirmedByUserId: user.uid,
          confirmedAt: serverTimestamp(),
          assignments,
        });
      }
      setReflectButtonHidden((prev) => ({ ...prev, [ci]: true }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "確定の保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleClearResolution() {
    if (!groupId || !topicId) return;
    if (!confirm("旅程への表示を取り消しますか？")) return;
    setBusy("resolution");
    setError(null);
    try {
      await updateRecipePollResolution(groupId, topicId, null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  const tripNumDays =
    group && group.tripStartDate
      ? Math.max(1, calcTripNumDays(group.tripStartDate, group.tripEndDate))
      : 1;
  /** 旅程への献立反映（オーナー・管理者のみ。集計一覧は全員表示） */
  const canManageRecipeJourney =
    Boolean(
      user &&
      topic &&
      topic.category === "recipe_vote" &&
      canManage &&
      (topic.recipePoll?.candidates?.length ?? 0) > 0,
    );

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

  async function handleShareLine() {
    if (!group || !topic) return;
    setError(null);
    setBusy("share-line");
    try {
      const absoluteUrl = `${window.location.origin}/groups/${groupId}/bulletin/${topicId}`;
      await shareBulletinTopicPreferred({
        groupName: group.name,
        topicTitle: topic.title,
        absoluteUrl,
        comment: remindComment.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "共有に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemindPush() {
    if (!user || !group || !topic) return;
    setError(null);
    setBusy("remind-push");
    try {
      const ok = await sendNotification({
        type: "bulletin_topic_remind",
        groupId,
        groupName: group.name,
        topicId,
        topicTitle: topic.title,
        senderName: user.displayName ?? "メンバー",
        senderUid: user.uid,
        comment: remindComment.trim() || null,
      });
      if (!ok) {
        setError(
          "プッシュ通知を送信できませんでした。ログイン状態とネット接続を確認してください。",
        );
      }
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
  const isImportantTopic = topic.importance === "important";
  /** 一覧と違い詳細では全面アンバーにしない。重要はピルのみ、ピン留めのみは薄い帯で示す */
  const detailAmberSurface = topic.pinned && !isImportantTopic;
  /** レシピ投票以外: タイトル固定・本文はスクロール・下部に入力 */
  const chatLayout = !editingTopic && topic.category !== "recipe_vote";

  if (chatLayout) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden overscroll-y-contain bg-zinc-100 pb-0 pt-2 dark:bg-zinc-950 sm:pt-3"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 3.5rem)",
        }}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden px-4">
        {error ? (
          <p
            className="shrink-0 pt-1 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <header
          className={`mt-2 shrink-0 border-b px-3 py-2.5 sm:px-4 ${
            detailAmberSurface
              ? "border-amber-300 bg-amber-50 shadow-sm ring-1 ring-amber-200/80 dark:border-amber-800/70 dark:bg-amber-950/90 dark:ring-amber-900/40"
              : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          }`}
        >
          {topic.importance === "important" ? (
            <p className="mb-1 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700">
              重要トピック
            </p>
          ) : null}
          {topic.pinned ? (
            <p className="mb-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
              📌 ピン留め
            </p>
          ) : null}
          <h1 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50 sm:text-xl">
            {topic.category === "nearby_map"
              ? formatNearbyMapTopicHeadingTitle(topic.title)
              : topic.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
              {BULLETIN_CATEGORY_LABELS[topic.category]}
            </span>
            {normalizeBulletinTopicTags(topic).map((t) => (
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
            {topic.importance === "important" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                重要
              </span>
            ) : null}
          </div>

          {user && isMember ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
              <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
                共有・再通知
              </p>
              <input
                type="text"
                value={remindComment}
                onChange={(e) =>
                  setRemindComment(e.target.value.slice(0, 300))
                }
                maxLength={300}
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                placeholder="一言メッセージ（任意・300文字まで）"
                disabled={busy !== null}
                aria-label="一言メッセージ（任意・300文字まで）"
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
                {isTopicAuthor || canManage ? (
                  <VisibilityBadge kind="authorOrAdmin" />
                ) : null}
                {canManage && !isTopicAuthor ? (
                  <VisibilityBadge kind="admin" />
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleShareLine()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-800/25 bg-[#06C755] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                  aria-label="LINEで共有"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4 shrink-0 opacity-95"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.448-.39l1.395-5.087a.39.39 0 00-.297-.17 48.977 48.977 0 01-3.476-.383c-1.978-.292-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.678 3.348-3.97z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {busy === "share-line" ? "開いています…" : "LINE"}
                </button>
                {isTopicAuthor || canManage ? (
                  <button
                    type="button"
                    onClick={() => void handleRemindPush()}
                    disabled={busy !== null}
                    className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200/90 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {busy === "remind-push" ? "送信中…" : "push通知"}
                  </button>
                ) : null}
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
            </div>
          ) : null}
        </header>

        <div
          ref={chatScrollRef}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain bg-zinc-100/90 px-2 py-2 [-webkit-overflow-scrolling:touch] dark:bg-zinc-900/40"
        >
          <div ref={chatInnerRef} className="space-y-3">
            <div
              className={
                isTopicAuthor
                  ? "flex flex-col items-end gap-0.5"
                  : "flex flex-col items-start gap-0.5"
              }
            >
              {topic.category === "nearby_map" ? (
                <div className="w-full min-w-0 self-stretch">
                  <NearbyMapTopicDisplay
                    body={topic.body}
                    spots={topic.nearbyMapSpots ?? []}
                  />
                </div>
              ) : (
                <div
                  className={`max-w-[min(85%,22rem)] rounded-[17px] px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    isTopicAuthor
                      ? "rounded-br-[5px] bg-[#06C755] text-white"
                      : "rounded-bl-[5px] border border-zinc-200/90 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-600/90 dark:bg-zinc-800/95 dark:text-zinc-100"
                  }`}
                >
                  <BulletinRichBody
                    body={topic.body}
                    className="text-sm leading-relaxed"
                    textClassName={
                      isTopicAuthor
                        ? "text-white"
                        : "text-zinc-800 dark:text-zinc-200"
                    }
                    imgClassName={
                      isTopicAuthor
                        ? "border-white/30"
                        : "border-zinc-200 dark:border-zinc-600"
                    }
                  />
                </div>
              )}
              {isTopicAuthor ? (
                <>
                  <p className="px-1 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formatTs(topic.createdAt)}
                    {isUpdatedTopic(topic) ? (
                      <span>（更新: {formatTs(topic.updatedAt)}）</span>
                    ) : null}
                  </p>
                  {topicOpenReadCount > 0 ? (
                    <p className="px-1 text-right text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
                      既読 {topicOpenReadCount}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="px-1 text-left text-[11px] text-zinc-500 dark:text-zinc-400">
                  {topic.authorDisplayName ||
                    topic.authorUserId.slice(0, 8) + "…"}{" "}
                  · {formatTs(topic.createdAt)}
                  {isUpdatedTopic(topic) ? (
                    <span>（更新: {formatTs(topic.updatedAt)}）</span>
                  ) : null}
                </p>
              )}
            </div>

          <section className="mt-4" aria-label="返信スレッド">
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
                    className={
                      isOwn ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div className="max-w-[min(85%,22rem)]">
                      {editingReplyId === id ? (
                        <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-600 dark:bg-zinc-900/80">
                          <textarea
                            ref={editReplyBodyRef}
                            value={editReplyBody}
                            onChange={(e) => setEditReplyBody(e.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                            onPaste={(e) =>
                              void pasteBulletinImage(
                                e,
                                editReplyBody,
                                setEditReplyBody,
                                true,
                              )
                            }
                          />
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <BulletinImageAttachButton
                              inputId={bulletinImgReplyEditId}
                              disabled={busy !== null}
                              onFile={(f) =>
                                void insertImageFromFile(
                                  f,
                                  editReplyBody,
                                  setEditReplyBody,
                                  editReplyBodyRef,
                                  true,
                                )
                              }
                            />
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
                            className={`rounded-[17px] px-3 py-2 text-sm leading-relaxed shadow-sm ${
                              isOwn
                                ? "rounded-br-[5px] bg-[#06C755] text-white"
                                : "rounded-bl-[5px] border border-zinc-200/90 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-600/90 dark:bg-zinc-800/95 dark:text-zinc-100"
                            }`}
                          >
                            <BulletinRichBody
                              body={data.body}
                              textClassName={
                                isOwn
                                  ? "text-white"
                                  : "text-zinc-800 dark:text-zinc-200"
                              }
                              imgClassName={
                                isOwn
                                  ? "border-white/30"
                                  : "border-zinc-200 dark:border-zinc-600"
                              }
                            />
                          </div>
                          {isOwn ? (
                            <>
                              <p className="mt-1 text-[10px] leading-tight text-zinc-400 text-right">
                                {formatTs(data.createdAt)}
                                {isUpdatedReply(data) ? (
                                  <span>（更新 {formatTs(data.updatedAt)}）</span>
                                ) : null}
                              </p>
                              {readCount > 0 ? (
                                <p className="mt-0.5 text-[10px] leading-tight text-zinc-400 text-right">
                                  既読 {readCount}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="mt-1 text-[10px] leading-tight text-zinc-400 text-left">
                              {label} · {formatTs(data.createdAt)}
                              {isUpdatedReply(data) ? (
                                <span>（更新 {formatTs(data.updatedAt)}）</span>
                              ) : null}
                            </p>
                          )}
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
            <div ref={chatEndRef} className="h-1 shrink-0" aria-hidden />
          </section>
          </div>
        </div>

        {user && isMember ? (
          <div className="shrink-0 border-t border-zinc-200/90 bg-zinc-50 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-zinc-700 dark:bg-zinc-900/80">
            <div className="flex items-end gap-2">
              <textarea
                ref={replyComposerRef}
                value={newReplyBody}
                onChange={(e) => setNewReplyBody(e.target.value)}
                rows={1}
                disabled={busy !== null}
                aria-label="メッセージ"
                className="h-10 min-h-10 max-h-10 min-w-0 flex-1 resize-none overflow-y-auto rounded-[18px] border border-zinc-300 bg-white px-3 py-2 text-sm leading-tight text-zinc-900 focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                onPaste={(e) =>
                  void pasteBulletinImage(e, newReplyBody, setNewReplyBody, true)
                }
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (newReplyBody.trim() && busy === null) {
                      void handleCreateReply();
                    }
                  }
                }}
              />
              <BulletinImageAttachButton
                inputId={bulletinImgReplyId}
                disabled={busy !== null}
                onFile={(f) =>
                  void insertImageFromFile(
                    f,
                    newReplyBody,
                    setNewReplyBody,
                    replyComposerRef,
                    true,
                  )
                }
              />
              <button
                type="button"
                onClick={handleCreateReply}
                disabled={busy !== null || !newReplyBody.trim()}
                className="shrink-0 rounded-full bg-[#06C755] px-4 py-2 text-sm font-medium text-white hover:bg-[#05b34c] disabled:opacity-40"
              >
                {busy === "reply" ? "…" : "送信"}
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <article
        className={`mt-4 rounded-xl border p-3 sm:p-4 ${
          detailAmberSurface
            ? "border-amber-300/90 bg-amber-50 shadow-sm ring-1 ring-amber-200/80 dark:border-amber-800/70 dark:bg-amber-950/35 dark:ring-amber-900/40"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
        }`}
      >
        {topic.importance === "important" ? (
          <p className="mb-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700">
            重要トピック
          </p>
        ) : null}
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
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-500">
                  {editCategory === "recipe_vote"
                    ? "レシピページのURL（1行に1件）"
                    : editCategory === "nearby_map"
                      ? "本文（任意）"
                      : "本文"}
                </span>
                {editCategory !== "recipe_vote" ? (
                  <BulletinImageAttachButton
                    inputId={bulletinImgTopicId}
                    disabled={busy !== null}
                    onFile={(f) =>
                      void insertImageFromFile(
                        f,
                        editBody,
                        setEditBody,
                        editTopicBodyRef,
                        true,
                      )
                    }
                  />
                ) : null}
              </div>
              <textarea
                ref={editTopicBodyRef}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={editCategory === "recipe_vote" ? 8 : 8}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                placeholder={
                  editCategory === "recipe_vote"
                    ? "https://…"
                    : undefined
                }
                onPaste={(e) =>
                  void pasteBulletinImage(
                    e,
                    editBody,
                    setEditBody,
                    editCategory !== "recipe_vote",
                  )
                }
              />
            </div>
            {editCategory === "nearby_map" ? (
              <div className="rounded-md border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
                  立ち寄り先の地図を編集
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="text-xs text-zinc-600 dark:text-zinc-400">
                    場所名
                    <input
                      type="text"
                      value={editNearbyMapName}
                      onChange={(e) => setEditNearbyMapName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例: 道の駅 富楽里"
                    />
                  </label>
                  <label className="text-xs text-zinc-600 dark:text-zinc-400">
                    地図URL
                    <input
                      type="url"
                      value={editNearbyMapUrl}
                      onChange={(e) => setEditNearbyMapUrl(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="https://maps.google.com/..."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addEditNearbyMapSpot}
                    disabled={!editNearbyMapName.trim() || !isValidMapUrl(editNearbyMapUrl)}
                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    追加
                  </button>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {editNearbyMapSpots.map((spot, idx) => (
                    <li key={`${spot.name}-${idx}`} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-sm dark:bg-zinc-900/70">
                      <span className="truncate text-zinc-700 dark:text-zinc-200">
                        {spot.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditNearbyMapSpots((prev) =>
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
            <BulletinTopicTagsField
              value={editTags}
              onChange={setEditTags}
              disabled={busy !== null}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveTopic}
                disabled={
                  busy !== null ||
                  !editTitle.trim() ||
                  (editCategory === "recipe_vote"
                    ? parseRecipeUrlLines(editBody).length === 0
                    : editCategory === "nearby_map"
                      ? editNearbyMapSpots.length === 0
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
                  setEditTags(normalizeBulletinTopicTags(topic));
                  setEditNearbyMapName("");
                  setEditNearbyMapUrl("");
                  setEditNearbyMapSpots(topic.nearbyMapSpots ?? []);
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
              {topic.category === "nearby_map"
                ? formatNearbyMapTopicHeadingTitle(topic.title)
                : topic.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-zinc-500">
              <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                {BULLETIN_CATEGORY_LABELS[topic.category]}
              </span>
              {normalizeBulletinTopicTags(topic).map((t) => (
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
              {topic.importance === "important" ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  重要
                </span>
              ) : null}
            </div>

            {user && isMember ? (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
                  共有・再通知
                </p>
                <input
                  type="text"
                  value={remindComment}
                  onChange={(e) => setRemindComment(e.target.value.slice(0, 300))}
                  maxLength={300}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  placeholder="一言メッセージ（任意・300文字まで）"
                  disabled={busy !== null}
                  aria-label="一言メッセージ（任意・300文字まで）"
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
                  {isTopicAuthor || canManage ? (
                    <VisibilityBadge kind="authorOrAdmin" />
                  ) : null}
                  {canManage && !isTopicAuthor ? (
                    <VisibilityBadge kind="admin" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleShareLine()}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-800/25 bg-[#06C755] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                    aria-label="LINEで共有"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0 opacity-95"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.448-.39l1.395-5.087a.39.39 0 00-.297-.17 48.977 48.977 0 01-3.476-.383c-1.978-.292-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.678 3.348-3.97z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {busy === "share-line" ? "開いています…" : "LINE"}
                  </button>
                  {isTopicAuthor || canManage ? (
                    <button
                      type="button"
                      onClick={() => void handleRemindPush()}
                      disabled={busy !== null}
                      className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200/90 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      {busy === "remind-push" ? "送信中…" : "push通知"}
                    </button>
                  ) : null}
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
              </div>
            ) : null}

            {topic.category === "recipe_vote" &&
            topic.recipePoll?.candidates?.length ? (
              <div className="mt-4 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    候補を比較・評価
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    点数<strong>1・2・3・4・5</strong>はそれぞれ<strong>1回だけ</strong>使えます（同じ点数を複数のレシピに付けられません）。
                    別のレシピに同じ点数を付けると、もともと付いていたレシピのその点数は外れます。最大<strong>5レシピ</strong>まで評価できます。
                    合計点が多いほど人気です。
                  </p>
                  {user && isMember && draftRatings.length === nCandidates ? (
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                      あなたの評価済み:{" "}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {countRatedCandidates(draftRatings)}
                      </span>
                      / 5 候補
                    </p>
                  ) : null}
                  {canManage && recipeVoteAdminSummary ? (
                    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/90 p-3 dark:border-violet-900/50 dark:bg-violet-950/25">
                      <div className="flex flex-wrap items-center gap-2">
                        <VisibilityBadge kind="admin" />
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
                          投票の進捗
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-violet-900/85 dark:text-violet-200/90">
                        メンバーのうち、1点以上付けて「評価を保存」した人:{" "}
                        <span className="font-semibold">
                          {recipeVoteAdminSummary.voted.length -
                            recipeVoteAdminSummary.extraVoters.length}
                        </span>
                        {" / "}
                        {members.length} 名
                      </p>
                      {recipeVoteAdminSummary.voted.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-violet-950 dark:text-violet-100">
                          {recipeVoteAdminSummary.voted.map((v) => (
                            <li key={v.userId} className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <span className="font-medium">
                                {memberDisplayName(v.userId, members)}
                              </span>
                              {!members.some((m) => m.userId === v.userId) ? (
                                <span className="text-violet-600/90 dark:text-violet-300/90">
                                  （現在メンバー外）
                                </span>
                              ) : null}
                              <span className="text-violet-700/80 dark:text-violet-300/80">
                                評価 {v.ratedCount} / 5 候補
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-violet-800/80 dark:text-violet-200/80">
                          まだ投票済みのメンバーはいません。
                        </p>
                      )}
                      {recipeVoteAdminSummary.notVoted.length > 0 ? (
                        <div className="mt-3 border-t border-violet-200/80 pt-2 dark:border-violet-800/60">
                          <p className="text-[11px] font-medium text-violet-800 dark:text-violet-200">
                            未投票のメンバー
                          </p>
                          <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-violet-900/90 dark:text-violet-100/90">
                            {recipeVoteAdminSummary.notVoted.map((uid) => (
                              <li key={uid}>
                                {memberDisplayName(uid, members)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : recipeVoteAdminSummary.notVoted.length === 0 &&
                        members.length > 0 ? (
                        <p className="mt-2 text-[11px] text-violet-800/75 dark:text-violet-200/75">
                          全員が投票済みです。
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {topic.recipePoll.candidates.map((c, idx) => {
                    const total = recipeScoreTotals[idx] ?? 0;
                    const label = c.sourceTitle || c.url;
                    const my = draftRatings[idx] ?? 0;
                    const active = my >= 1 && my <= 5;
                    return (
                      <div
                        key={`${c.url}-${idx}`}
                        className={`flex flex-col overflow-hidden rounded-xl border bg-zinc-50/80 dark:bg-zinc-900/50 ${
                          active
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
                          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
                            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              合計点 {total}{" "}
                              <span className="font-normal text-zinc-400">
                                （全員の点数の合計）
                              </span>
                            </p>
                          </div>
                          {user && isMember ? (
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                                あなたの評価（1〜5）
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {([1, 2, 3, 4, 5] as const).map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => setDraftRatingAt(idx, s)}
                                    disabled={busy !== null}
                                    className={`min-h-[36px] min-w-[36px] rounded-lg text-sm font-semibold transition ${
                                      my === s
                                        ? "bg-emerald-600 text-white"
                                        : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                                    }`}
                                  >
                                    {s}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setDraftRatingAt(idx, 0)}
                                  disabled={busy !== null}
                                  className="rounded-lg border border-dashed border-zinc-300 px-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                >
                                  クリア
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-auto border-t border-zinc-200 pt-2 dark:border-zinc-700">
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                            >
                              レシピを開く
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {user && isMember && draftRatings.length === nCandidates ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveMyRatings}
                      disabled={busy !== null}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      {busy === "vote" ? "保存中…" : "評価を保存"}
                    </button>
                    <span className="text-xs text-zinc-500">
                      変更後は「評価を保存」で反映されます
                    </span>
                  </div>
                ) : null}

                <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    投票結果の集計（合計点の高い順）
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    皆の投票の点数を合計し、多い順に並べています。合計点が同じ候補は同じ順位とし、次の順位は飛ばします（例: 1位が2件なら次は3位）。
                  </p>
                  <ul className="mt-4 space-y-3">
                    {recipeJourneyOrderIndices.map((ci) => {
                      const cand = topic.recipePoll!.candidates[ci]!;
                      const title = cand.sourceTitle || cand.url;
                      const totalPts = recipeScoreTotals[ci] ?? 0;
                      const displayRank = recipePollCompetitionRanks[ci] ?? 0;
                      return (
                        <li
                          key={`rank-${cand.url}-${ci}`}
                          className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-900/60"
                        >
                          {cand.imageUrl ? (
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
                              <img
                                src={cand.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-[10px] text-zinc-500 dark:bg-zinc-800">
                              画像なし
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {displayRank}位
                              </span>
                              {" · 合計点 "}
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {totalPts}
                              </span>
                            </p>
                            <p className="mt-1 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                              {title}
                            </p>
                            <a
                              href={cand.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 inline-block text-xs font-medium text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                            >
                              レシピを開く
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {canManageRecipeJourney ? (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <div className="flex flex-wrap items-center gap-2">
                      <VisibilityBadge kind="admin" />
                      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        投票結果を確定して旅程に反映
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                      上の「投票結果の集計」と<strong className="font-semibold">同じ順</strong>
                      で、レシピ候補ごとに Day と食事を指定し、
                      <strong className="font-semibold">各カードの茶色のボタン</strong>
                      で<strong>その候補だけ</strong>旅程に保存します。ドロップダウンを変えただけでは保存されません。
                      保存後は同じカードのボタンは隠れます。設定し直すときは「旅程に表示しない」のあと「Day・食事を指定する」でボタンが戻ります。
                    </p>
                    <div className="mt-4 space-y-4">
                      {recipeJourneyOrderIndices.map((ci) => {
                        const cand = topic.recipePoll!.candidates[ci]!;
                        const slot =
                          ci < resolutionPerCandidate.length
                            ? resolutionPerCandidate[ci]
                            : null;
                        const title = cand.sourceTitle || cand.url;
                        const displayRank = recipePollCompetitionRanks[ci] ?? 0;
                        return (
                          <div
                            key={`res-${cand.url}-${ci}`}
                            className="rounded-xl border border-amber-100/80 bg-white/95 p-4 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/80"
                          >
                            <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
                              第{displayRank}位
                              <span className="ml-2 font-normal text-zinc-700 dark:text-zinc-300">
                                {title}
                              </span>
                            </p>
                            {slot ? (
                              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-700">
                                <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                                  Day
                                  <select
                                    value={slot.dayNumber}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value, 10);
                                      patchCandidateResolution(ci, {
                                        dayNumber: v,
                                        meal: slot.meal,
                                      });
                                    }}
                                    className="mt-0.5 block min-w-[6.5rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                                  >
                                    {Array.from(
                                      { length: tripNumDays },
                                      (_, i) => i + 1,
                                    ).map((d) => (
                                      <option key={d} value={d}>
                                        Day {d}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                                  食事
                                  <select
                                    value={slot.meal}
                                    onChange={(e) => {
                                      const v = e.target.value as RecipeMealSlot;
                                      patchCandidateResolution(ci, {
                                        dayNumber: slot.dayNumber,
                                        meal: v,
                                      });
                                    }}
                                    className="mt-0.5 block min-w-[6.5rem] rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                                  >
                                    {(
                                      Object.entries(RECIPE_MEAL_LABELS) as [
                                        RecipeMealSlot,
                                        string,
                                      ][]
                                    ).map(([k, lab]) => (
                                      <option key={k} value={k}>
                                        {lab}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => patchCandidateResolution(ci, null)}
                                  disabled={busy !== null}
                                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                                >
                                  旅程に表示しない
                                </button>
                              </div>
                            ) : (
                              <div className="mt-4 border-t border-dashed border-zinc-200 pt-4 dark:border-zinc-700">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  このレシピは旅程の献立に含めません。
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchCandidateResolution(ci, {
                                      dayNumber: 1,
                                      meal: "dinner",
                                    })
                                  }
                                  disabled={busy !== null}
                                  className="mt-2 text-xs font-medium text-amber-900 underline dark:text-amber-200"
                                >
                                  Day・食事を指定する
                                </button>
                              </div>
                            )}
                            {!(reflectButtonHidden[ci] && slot) ? (
                              <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-700">
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmResolution(ci)}
                                  disabled={busy !== null}
                                  className="w-full rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                                >
                                  {busy === `res-${ci}`
                                    ? "保存中…"
                                    : slot
                                      ? "このレシピを旅程に反映"
                                      : "この設定を旅程に保存"}
                                </button>
                                <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                                  {slot
                                    ? "この候補の Day・食事の設定だけが旅程に保存されます（他の候補の確定は変わりません）。"
                                    : "この候補を旅程から外す内容を保存します。"}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-4 border-t border-zinc-100 pt-4 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                                旅程に反映済みです。Day や食事を変える場合は「旅程に表示しない」からやり直してください。
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {topic.recipePollResolution ? (
                      <div className="mt-5 border-t border-amber-200/60 pt-4 dark:border-amber-900/40">
                        <button
                          type="button"
                          onClick={handleClearResolution}
                          disabled={busy !== null}
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                        >
                          旅程への表示を取り消す
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <details className="text-xs text-zinc-500">
                  <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
                    登録したURL一覧
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-zinc-100 p-2 text-[11px] dark:bg-zinc-800">
                    {topic.body}
                  </pre>
                </details>
              </div>
            ) : topic.category === "nearby_map" ? (
              <div className="mt-3">
                <div
                  className={
                    isTopicAuthor
                      ? "flex flex-col items-end gap-0.5"
                      : "flex flex-col items-start gap-0.5"
                  }
                >
                  <div className="w-full min-w-0 self-stretch">
                    <NearbyMapTopicDisplay
                      body={topic.body}
                      spots={topic.nearbyMapSpots ?? []}
                    />
                  </div>
                  {isTopicAuthor ? (
                    <>
                      <p className="px-0.5 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatTs(topic.createdAt)}
                        {isUpdatedTopic(topic) ? (
                          <span>（更新: {formatTs(topic.updatedAt)}）</span>
                        ) : null}
                      </p>
                      {topicOpenReadCount > 0 ? (
                        <p className="px-0.5 text-right text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
                          既読 {topicOpenReadCount}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="px-0.5 text-left text-[11px] text-zinc-500">
                      {topic.authorDisplayName ||
                        topic.authorUserId.slice(0, 8) + "…"}{" "}
                      · {formatTs(topic.createdAt)}
                      {isUpdatedTopic(topic) ? (
                        <span>（更新: {formatTs(topic.updatedAt)}）</span>
                      ) : null}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div
                  className={
                    isTopicAuthor
                      ? "flex flex-col items-end gap-0.5"
                      : "flex flex-col items-start gap-0.5"
                  }
                >
                  <div
                    className={
                      isTopicAuthor
                        ? "max-w-[min(92%,22rem)] rounded-[17px] rounded-br-[5px] bg-[#06C755] px-3 py-2.5 shadow-sm"
                        : "max-w-[min(92%,22rem)] rounded-[17px] rounded-tl-[5px] border border-zinc-200/90 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-zinc-600 dark:bg-zinc-800"
                    }
                  >
                    <BulletinRichBody
                      body={topic.body}
                      className="text-sm leading-relaxed"
                      textClassName={
                        isTopicAuthor
                          ? "text-white"
                          : "text-zinc-800 dark:text-zinc-200"
                      }
                      imgClassName={
                        isTopicAuthor
                          ? "border-white/30"
                          : "border-zinc-200 dark:border-zinc-600"
                      }
                    />
                  </div>
                  {isTopicAuthor ? (
                    <>
                      <p className="px-0.5 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatTs(topic.createdAt)}
                        {isUpdatedTopic(topic) ? (
                          <span>（更新: {formatTs(topic.updatedAt)}）</span>
                        ) : null}
                      </p>
                      {topicOpenReadCount > 0 ? (
                        <p className="px-0.5 text-right text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
                          既読 {topicOpenReadCount}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="px-0.5 text-left text-[11px] text-zinc-500">
                      {topic.authorDisplayName ||
                        topic.authorUserId.slice(0, 8) + "…"}{" "}
                      · {formatTs(topic.createdAt)}
                      {isUpdatedTopic(topic) ? (
                        <span>（更新: {formatTs(topic.updatedAt)}）</span>
                      ) : null}
                    </p>
                  )}
                </div>
              </div>
            )}
            {topic.category === "recipe_vote" ? (
              isTopicAuthor ? (
                <>
                  <p className="mt-2 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formatTs(topic.createdAt)}
                    {isUpdatedTopic(topic) ? (
                      <span>（更新: {formatTs(topic.updatedAt)}）</span>
                    ) : null}
                  </p>
                  {topicOpenReadCount > 0 ? (
                    <p className="text-right text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
                      既読 {topicOpenReadCount}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-[11px] text-zinc-500">
                  {topic.authorDisplayName ||
                    topic.authorUserId.slice(0, 8) + "…"}{" "}
                  · {formatTs(topic.createdAt)}
                  {isUpdatedTopic(topic) ? (
                    <span>（更新: {formatTs(topic.updatedAt)}）</span>
                  ) : null}
                </p>
              )
            ) : null}

          </>
        )}
      </article>

      {/* 返信（LINE風バブル：自分＝右・他人＝左） */}
      <section
        className="mt-5 rounded-2xl bg-zinc-100/90 px-2 py-3 dark:bg-zinc-900/45 sm:px-3"
        aria-label="返信スレッド"
      >
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
                        ref={editReplyBodyRef}
                        value={editReplyBody}
                        onChange={(e) => setEditReplyBody(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                        onPaste={(e) =>
                          void pasteBulletinImage(
                            e,
                            editReplyBody,
                            setEditReplyBody,
                            true,
                          )
                        }
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <BulletinImageAttachButton
                          inputId={bulletinImgReplyEditId}
                          disabled={busy !== null}
                          onFile={(f) =>
                            void insertImageFromFile(
                              f,
                              editReplyBody,
                              setEditReplyBody,
                              editReplyBodyRef,
                              true,
                            )
                          }
                        />
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
                        className={`rounded-[17px] px-3 py-2 text-sm leading-relaxed shadow-sm ${
                          isOwn
                            ? "rounded-br-[5px] bg-[#06C755] text-white"
                            : "rounded-bl-[5px] border border-zinc-200/90 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-600/90 dark:bg-zinc-800/95 dark:text-zinc-100"
                        }`}
                      >
                        <BulletinRichBody
                          body={data.body}
                          textClassName={
                            isOwn
                              ? "text-white"
                              : "text-zinc-800 dark:text-zinc-200"
                          }
                          imgClassName={
                            isOwn
                              ? "border-white/30"
                              : "border-zinc-200 dark:border-zinc-600"
                          }
                        />
                      </div>
                      {isOwn ? (
                        <>
                          <p className="mt-1 text-[10px] leading-tight text-zinc-400 text-right">
                            {formatTs(data.createdAt)}
                            {isUpdatedReply(data) ? (
                              <span>（更新 {formatTs(data.updatedAt)}）</span>
                            ) : null}
                          </p>
                          {readCount > 0 ? (
                            <p className="mt-0.5 text-[10px] leading-tight text-zinc-400 text-right">
                              既読 {readCount}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-1 text-[10px] leading-tight text-zinc-400 text-left">
                          {label} · {formatTs(data.createdAt)}
                          {isUpdatedReply(data) ? (
                            <span>（更新 {formatTs(data.updatedAt)}）</span>
                          ) : null}
                        </p>
                      )}
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
              ref={replyComposerRef}
              value={newReplyBody}
              onChange={(e) => setNewReplyBody(e.target.value)}
              rows={1}
              disabled={busy !== null}
              aria-label="メッセージ"
              className="h-10 min-h-10 max-h-10 min-w-0 flex-1 resize-none overflow-y-auto rounded-[18px] border border-zinc-300 bg-white px-3 py-2 text-sm leading-tight text-zinc-900 focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              onPaste={(e) =>
                void pasteBulletinImage(e, newReplyBody, setNewReplyBody, true)
              }
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (newReplyBody.trim() && busy === null) void handleCreateReply();
                }
              }}
            />
            <BulletinImageAttachButton
              inputId={bulletinImgReplyId}
              disabled={busy !== null}
              onFile={(f) =>
                void insertImageFromFile(
                  f,
                  newReplyBody,
                  setNewReplyBody,
                  replyComposerRef,
                  true,
                )
              }
            />
            <button
              type="button"
              onClick={handleCreateReply}
              disabled={busy !== null || !newReplyBody.trim()}
              className="shrink-0 rounded-full bg-[#06C755] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#05b34c] disabled:opacity-40"
            >
              {busy === "reply" ? "…" : "送信"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
