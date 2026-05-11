"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  deleteGroup,
  getGroup,
  getMemberForUser,
  leaveGroup,
  updateDestination,
  updateGroupDescription,
  updateGroupMemoryPhotoUrl,
  updateGroupName,
  updateGroupTripDates,
} from "@/lib/firestore/groups";
import { listDestinationPolls, type PollItem } from "@/lib/firestore/destination-votes";
import { listTripRoutes } from "@/lib/firestore/trip";
import {
  createBulletinTopic,
  listBulletinReplies,
  listBulletinTopicsWithReplyCounts,
} from "@/lib/firestore/bulletin";
import { sendNotification } from "@/lib/notify";
import { saveLastTripId } from "@/lib/last-trip";
import { uploadGroupMemoryPhoto } from "@/lib/storage/group-memory-photo";
import {
  areAllTripWorkflowStepsComplete,
} from "@/lib/trip-workflow-all-complete";
import {
  computeDashboardInsights,
  isVoteOrDecisionTopic,
} from "@/lib/trip-dashboard-insights";
import { listScheduleCandidates, listScheduleResponses } from "@/lib/firestore/schedule";
import { listRecipeVotes } from "@/lib/firestore/bulletin";
import { listDestinationVotes } from "@/lib/firestore/destination-votes";
import { normalizeDecidedNamesFromPollDoc } from "@/lib/destination-poll-decided";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { ScheduleResponseDoc } from "@/types/schedule";
import type { BulletinRecipeVoteDoc } from "@/types/bulletin";
import type { VoteItem } from "@/lib/firestore/destination-votes";
import type { TripRouteDoc } from "@/types/trip";
import { fetchRecipePollFromUrls } from "@/lib/recipe-preview-api";
import { parseRecipeUrlLines } from "@/lib/recipe-url-input";
import { BulletinExpandableBodyField } from "@/components/bulletin/bulletin-expandable-body-field";
import { BulletinImageAttachButton } from "@/components/bulletin/bulletin-image-attach-button";
import { BulletinTopicTagsField } from "@/components/bulletin-topic-tags-field";
import { useBulletinImagePaste } from "@/hooks/use-bulletin-image-paste";
import { VisibilityBadge } from "@/components/visibility-badge";
import { TripDashboardInsightsPanel } from "@/components/trip/trip-dashboard-insights-panel";
import {
  BULLETIN_CATEGORY_LABELS,
  BULLETIN_CATEGORY_OPTIONS,
  BULLETIN_TOPIC_TAG_LABELS,
  type BulletinCategory,
  type BulletinImportance,
  type BulletinReplyDoc,
  type BulletinTopicDoc,
  type BulletinTopicTag,
  type RecipePollData,
  normalizeBulletinTopicTags,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";

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

function textFromBulletinBody(body: string): string {
  return body.replace(/!\[[^\]]*\]\([^)]+\)/g, "[画像]").trim();
}

function tsToMs(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  return 0;
}

type DashboardExtrasState = {
  scheduleCandidateIds: string[];
  scheduleResponses: ScheduleResponseDoc[];
  openRecipeVotes: {
    topicId: string;
    title: string;
    candidateCount: number;
    votes: { userId: string; data: BulletinRecipeVoteDoc }[];
  }[];
  openDestinationPollVotes: {
    pollId: string;
    pollTitle: string;
    votes: VoteItem[];
  }[];
};

export function GroupDetailClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { pasteBulletinImage, insertImageFromFile } = useBulletinImagePaste({
    groupId,
    uid: user?.uid,
    disabled: busy !== null,
    setBusy,
    setError,
  });

  const newTopicBodyRef = useRef<HTMLTextAreaElement>(null);
  const bulletinImgDashTopicId = useId();

  // 旅行名編集用
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

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
  const [memoryPhotoPreview, setMemoryPhotoPreview] = useState<string | null>(null);
  const [memoryPhotoDraftFile, setMemoryPhotoDraftFile] = useState<File | null>(null);
  const [memoryPhotoDraftPreview, setMemoryPhotoDraftPreview] = useState<string | null>(null);
  const [isMemoryPhotoLightboxOpen, setIsMemoryPhotoLightboxOpen] = useState(false);
  /** 思い出写真の解放条件（ステップナビと同一ロジック） */
  const [workflowPolls, setWorkflowPolls] = useState<PollItem[]>([]);
  const [workflowTripRoutes, setWorkflowTripRoutes] = useState<
    { id: string; data: TripRouteDoc }[]
  >([]);

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

  const [dashboardExtras, setDashboardExtras] =
    useState<DashboardExtrasState | null>(null);
  /** ダッシュボード文言（オーナー／管理者向け）用 */
  const [myMember, setMyMember] = useState<MemberDoc | null>(null);
  /** default: 直近アクティブ1件のみ / all: 全件 / vote: 決定系のみ */
  const [topicView, setTopicView] = useState<"default" | "all" | "vote">(
    "default",
  );
  /** default 表示で見せるトピック（null なら更新日時が最新の1件を自動選択） */
  const [spotlightTopicId, setSpotlightTopicId] = useState<string | null>(null);
  const [topicRepliesById, setTopicRepliesById] = useState<
    Record<string, { id: string; data: BulletinReplyDoc }[]>
  >({});

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
        setTopics([]);
        setWorkflowPolls([]);
        setWorkflowTripRoutes([]);
        setDashboardExtras(null);
        setMyMember(null);
        return;
      }
      setGroup(g);
      if (user) {
        try {
          const m = await getMemberForUser(groupId, user.uid);
          setMyMember(m);
        } catch {
          setMyMember(null);
        }
      } else {
        setMyMember(null);
      }
      let polls: Awaited<ReturnType<typeof listDestinationPolls>> = [];
      let topicsList: Awaited<
        ReturnType<typeof listBulletinTopicsWithReplyCounts>
      > = [];
      try {
        const [p, routes] = await Promise.all([
          listDestinationPolls(groupId),
          listTripRoutes(groupId),
        ]);
        polls = p;
        setWorkflowPolls(polls);
        setWorkflowTripRoutes(routes);
      } catch {
        polls = [];
        setWorkflowPolls([]);
        setWorkflowTripRoutes([]);
      }
      try {
        topicsList = await listBulletinTopicsWithReplyCounts(groupId);
        setTopics(topicsList);
      } catch {
        topicsList = [];
        setTopics([]);
      }
      try {
        const [cands, resps] = await Promise.all([
          listScheduleCandidates(groupId),
          listScheduleResponses(groupId),
        ]);
        const scheduleCandidateIds = cands.map((c) => c.id);
        const scheduleResponses = resps.map((r) => r.data);

        const recipeTopicsMeta = topicsList.filter(
          (row) =>
            row.data.category === "recipe_vote" &&
            !row.data.recipePollResolution &&
            (row.data.recipePoll?.candidates?.length ?? 0) > 0,
        );
        const openRecipeVotes = await Promise.all(
          recipeTopicsMeta.map(async (row) => {
            const n = row.data.recipePoll!.candidates!.length;
            const vl = await listRecipeVotes(groupId, row.id);
            return {
              topicId: row.id,
              title: row.data.title,
              candidateCount: n,
              votes: vl.map((x) => ({
                userId: x.userId,
                data: x.data,
              })),
            };
          }),
        );

        const undecidedPolls = polls.filter(
          (p) => normalizeDecidedNamesFromPollDoc(p.data).length === 0,
        );
        const openDestinationPollVotes = await Promise.all(
          undecidedPolls.map(async (p) => ({
            pollId: p.id,
            pollTitle: (p.data.title?.trim() || "目的地投票").slice(0, 200),
            votes: await listDestinationVotes(groupId, p.id),
          })),
        );

        setDashboardExtras({
          scheduleCandidateIds,
          scheduleResponses,
          openRecipeVotes,
          openDestinationPollVotes,
        });
      } catch {
        setDashboardExtras(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
      setWorkflowPolls([]);
      setWorkflowTripRoutes([]);
      setDashboardExtras(null);
      setMyMember(null);
    }
  }, [groupId, user]);

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
        undefined,
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

  useEffect(() => {
    setMemoryPhotoPreview(group?.memoryPhotoUrl ?? null);
  }, [group?.memoryPhotoUrl]);

  useEffect(() => {
    return () => {
      if (memoryPhotoDraftPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(memoryPhotoDraftPreview);
      }
    };
  }, [memoryPhotoDraftPreview]);

  useEffect(() => {
    if (!isMemoryPhotoLightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMemoryPhotoLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMemoryPhotoLightboxOpen]);

  const isOwner = user && group && user.uid === group.ownerId;
  const canManageSchedule = useMemo(() => {
    if (!group || !user) return false;
    if (user.uid === group.ownerId) return true;
    return myMember?.role === "admin";
  }, [group, user, myMember]);
  const memoryPhotoSectionUnlocked = useMemo(() => {
    if (!group) return false;
    return areAllTripWorkflowStepsComplete(
      group,
      workflowPolls,
      workflowTripRoutes,
    );
  }, [group, workflowPolls, workflowTripRoutes]);

  const allTripWorkflowComplete = useMemo(
    () =>
      !!group &&
      areAllTripWorkflowStepsComplete(
        group,
        workflowPolls,
        workflowTripRoutes,
      ),
    [group, workflowPolls, workflowTripRoutes],
  );

  const dashboardInsights = useMemo(() => {
    if (!group || !groupId || !dashboardExtras) return null;
    return computeDashboardInsights({
      groupId,
      group,
      destinationPolls: workflowPolls,
      tripRoutes: workflowTripRoutes,
      scheduleCandidateIds: dashboardExtras.scheduleCandidateIds,
      scheduleResponses: dashboardExtras.scheduleResponses,
      openRecipeVotes: dashboardExtras.openRecipeVotes,
      openDestinationPollVotes: dashboardExtras.openDestinationPollVotes,
      userId: user?.uid ?? null,
      canManageSchedule,
    });
  }, [
    group,
    groupId,
    dashboardExtras,
    workflowPolls,
    workflowTripRoutes,
    user?.uid,
    canManageSchedule,
  ]);

  const voteTopics = useMemo(
    () => topics.filter((x) => isVoteOrDecisionTopic(x.data)),
    [topics],
  );

  const sortByActivityDesc = useCallback(
    <T extends { data: BulletinTopicDoc }>(rows: T[]) =>
      [...rows].sort(
        (a, b) => tsToMs(b.data.updatedAt) - tsToMs(a.data.updatedAt),
      ),
    [],
  );

  const allSortedByActivity = useMemo(
    () => sortByActivityDesc(topics),
    [topics, sortByActivityDesc],
  );

  const defaultSpotlightRow = useMemo(
    () => allSortedByActivity[0] ?? null,
    [allSortedByActivity],
  );

  const spotlightRow = useMemo(() => {
    if (topicView !== "default") return null;
    if (spotlightTopicId) {
      return (
        topics.find((t) => t.id === spotlightTopicId) ?? defaultSpotlightRow
      );
    }
    return defaultSpotlightRow;
  }, [topicView, spotlightTopicId, topics, defaultSpotlightRow]);

  const visibleTopicRows = useMemo(() => {
    if (topicView === "default") {
      return spotlightRow ? [spotlightRow] : [];
    }
    if (topicView === "all") return allSortedByActivity;
    return sortByActivityDesc(voteTopics);
  }, [
    topicView,
    spotlightRow,
    allSortedByActivity,
    voteTopics,
    sortByActivityDesc,
  ]);

  /** ボタン横: 直近アクティブのうち、いま表示中の1件以外から最大3件 */
  const quickPickTopics = useMemo(() => {
    const sid = spotlightRow?.id ?? allSortedByActivity[0]?.id;
    return allSortedByActivity.filter((t) => t.id !== sid).slice(0, 3);
  }, [allSortedByActivity, spotlightRow]);

  useEffect(() => {
    if (!groupId) return;
    const ids = visibleTopicRows.map((row) => row.id);
    if (ids.length === 0) {
      setTopicRepliesById({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const replies = await listBulletinReplies(groupId, id);
            return [id, replies] as const;
          } catch {
            return [id, []] as const;
          }
        }),
      );
      if (cancelled) return;
      setTopicRepliesById(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, visibleTopicRows]);

  function startEditName() {
    if (!group) return;
    setDraftName(group.name);
    setEditingDates(false);
    setEditingName(true);
  }

  async function handleSaveName() {
    if (!groupId) return;
    const n = draftName.trim();
    if (!n) {
      setError("旅行名を入力してください。");
      return;
    }
    setBusy("save-name");
    setError(null);
    try {
      await updateGroupName(groupId, draftName);
      setEditingName(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function startEditDates() {
    if (!group) return;
    setDraftStart(group.tripStartDate ?? "");
    setDraftEnd(group.tripEndDate ?? "");
    setEditingName(false);
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

  async function handleMemoryPhotoFileChange(
    e: ChangeEvent<HTMLInputElement>,
  ) {
    if (!user || !groupId) return;
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    if (memoryPhotoDraftPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(memoryPhotoDraftPreview);
    }
    setMemoryPhotoDraftFile(file);
    setMemoryPhotoDraftPreview(URL.createObjectURL(file));
  }

  async function handleSaveMemoryPhoto() {
    if (!user || !groupId || !memoryPhotoDraftFile) return;
    setBusy("memory-photo-save");
    setError(null);
    try {
      const url = await uploadGroupMemoryPhoto(groupId, user.uid, memoryPhotoDraftFile);
      await updateGroupMemoryPhotoUrl(groupId, url);
      setMemoryPhotoPreview(url);
      setGroup((prev) => (prev ? { ...prev, memoryPhotoUrl: url } : prev));
      if (memoryPhotoDraftPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(memoryPhotoDraftPreview);
      }
      setMemoryPhotoDraftFile(null);
      setMemoryPhotoDraftPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "写真の保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function handleCancelMemoryPhotoSelection() {
    if (memoryPhotoDraftPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(memoryPhotoDraftPreview);
    }
    setMemoryPhotoDraftFile(null);
    setMemoryPhotoDraftPreview(null);
  }

  async function handleClearMemoryPhoto() {
    if (!groupId) return;
    setBusy("memory-photo-clear");
    setError(null);
    try {
      await updateGroupMemoryPhotoUrl(groupId, null);
      setMemoryPhotoPreview(null);
      if (memoryPhotoDraftPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(memoryPhotoDraftPreview);
      }
      setMemoryPhotoDraftFile(null);
      setMemoryPhotoDraftPreview(null);
      setGroup((prev) => (prev ? { ...prev, memoryPhotoUrl: null } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "写真の削除に失敗しました");
    } finally {
      setBusy(null);
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

  function renderTopicRow(row: {
    id: string;
    data: BulletinTopicDoc;
    replyCount: number;
  }) {
    const { id, data, replyCount } = row;
    const isImportant = data.importance === "important";
    const showImportant = isImportant || data.pinned;
    const tags = normalizeBulletinTopicTags(data);
    const replies = topicRepliesById[id] ?? [];
    const rootBody = textFromBulletinBody(data.body);
    const latestTs =
      replies.length > 0
        ? replies[replies.length - 1]?.data.createdAt
        : data.createdAt;
    return (
      <li key={id}>
        <Link
          href={`/groups/${groupId}/bulletin/${id}`}
          className={`block px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
            isImportant
              ? "mx-2 my-2 rounded-lg border-2 border-amber-500 bg-amber-50/90 shadow-sm ring-1 ring-amber-200/90 dark:border-amber-600 dark:bg-amber-950/35 dark:ring-amber-800/50"
              : showImportant
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
              <h3 className="mt-0.5 text-sm font-semibold leading-snug text-zinc-700 dark:text-zinc-200">
                トピック: {data.title}
              </h3>

              <div className="mt-2 flex flex-col gap-1.5">
                {rootBody ? (
                  <div className="mr-auto max-w-[min(92%,22rem)] rounded-[17px] rounded-tl-[5px] border border-zinc-200/90 bg-white px-3 py-2.5 text-xs leading-relaxed text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                    {rootBody}
                  </div>
                ) : null}
                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="ml-auto max-w-[min(92%,22rem)] rounded-[17px] rounded-tr-[5px] bg-[#06C755] px-3 py-2.5 text-xs leading-relaxed text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                  >
                    {textFromBulletinBody(reply.data.body)}
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {BULLETIN_CATEGORY_LABELS[data.category]}
                </span>
                {tags.map((tg) => (
                  <span
                    key={tg}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      tg === "priority_top"
                        ? "bg-rose-100 font-medium text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                        : "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                    }`}
                  >
                    {BULLETIN_TOPIC_TAG_LABELS[tg]}
                  </span>
                ))}
                {data.importance === "important" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/45 dark:text-amber-100 dark:ring-amber-700">
                    重要
                  </span>
                ) : null}
                <span>
                  {data.authorDisplayName ||
                    data.authorUserId.slice(0, 8) + "…"}{" "}
                  · 最新 {formatTs(latestTs)}
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
      {/* 旅行名 + 日程バッジ */}
      {editingName && isOwner ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            旅行名
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={200}
              autoFocus
              className="mt-1.5 w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-semibold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveName}
              disabled={busy !== null}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy === "save-name" ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
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
          {isOwner ? (
            <button
              type="button"
              onClick={startEditName}
              className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              旅行名を変更
            </button>
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
      )}

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

      <TripDashboardInsightsPanel
        insights={dashboardInsights}
        allWorkflowComplete={allTripWorkflowComplete}
      />

      {memoryPhotoSectionUnlocked ? (
      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              思い出写真
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              1枚だけ登録できます。「過去の旅行」一覧のサムネイルにも使われます。
            </p>
          </div>
          {isOwner ? (
            <label className="inline-flex cursor-pointer items-center rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
              写真を選択
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleMemoryPhotoFileChange(e)}
                disabled={busy !== null}
              />
            </label>
          ) : null}
        </div>
        {memoryPhotoDraftPreview || memoryPhotoPreview ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setIsMemoryPhotoLightboxOpen(true)}
              aria-label="思い出写真を拡大表示"
              className="block w-full cursor-zoom-in overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            >
              <Image
                src={memoryPhotoDraftPreview ?? memoryPhotoPreview ?? ""}
                alt="旅行の思い出写真"
                width={960}
                height={540}
                unoptimized
                className="h-44 w-full rounded-md object-cover transition-opacity hover:opacity-90 sm:h-56"
              />
            </button>
            {isOwner ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {memoryPhotoDraftFile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleSaveMemoryPhoto()}
                      disabled={busy !== null}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      {busy === "memory-photo-save" ? "保存中…" : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelMemoryPhotoSelection}
                      disabled={busy !== null}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      選択を取り消す
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleClearMemoryPhoto()}
                  disabled={busy !== null}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {busy === "memory-photo-clear" ? "削除中…" : "写真を削除"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            まだ写真が登録されていません。
          </p>
        )}
      </section>
      ) : null}

      {isMemoryPhotoLightboxOpen &&
      (memoryPhotoDraftPreview || memoryPhotoPreview) ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="思い出写真の拡大表示"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsMemoryPhotoLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="拡大表示を閉じる"
            onClick={(e) => {
              e.stopPropagation();
              setIsMemoryPhotoLightboxOpen(false);
            }}
            className="absolute right-3 top-3 rounded-md bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30"
          >
            閉じる
          </button>
          <Image
            src={memoryPhotoDraftPreview ?? memoryPhotoPreview ?? ""}
            alt="旅行の思い出写真（拡大表示）"
            width={1920}
            height={1080}
            unoptimized
            className="max-h-[90vh] max-w-[95vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

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

      {/* ── トピック（工程完了後はこちらを主役に見えるよう強調） ── */}
      <section
        className={`mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60 ${
          allTripWorkflowComplete
            ? "ring-1 ring-emerald-300/90 dark:ring-emerald-800/60"
            : ""
        }`}
      >
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
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                表示
              </span>
              <div
                className="inline-flex rounded-lg border border-zinc-300/90 bg-white p-0.5 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/90"
                role="group"
                aria-label="掲示板の表示切替"
              >
                <button
                  type="button"
                  onClick={() => setTopicView("all")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    topicView === "all"
                      ? "bg-emerald-700 text-white shadow-sm dark:bg-emerald-600"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  すべて表示
                </button>
                <button
                  type="button"
                  onClick={() => setTopicView("vote")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    topicView === "vote"
                      ? "bg-emerald-700 text-white shadow-sm dark:bg-emerald-600"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  決定系の表示
                </button>
              </div>
              {(topicView !== "default" || spotlightTopicId) && (
                <button
                  type="button"
                  onClick={() => {
                    setTopicView("default");
                    setSpotlightTopicId(null);
                  }}
                  className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  直近のみ
                </button>
              )}
            </div>
            {quickPickTopics.length > 0 ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 border-t border-emerald-200/60 pt-2.5 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 dark:border-emerald-800/40">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300/90">
                  話題
                </span>
                {quickPickTopics.map((row) => {
                  const active =
                    topicView === "default" && spotlightRow?.id === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      title={row.data.title}
                      onClick={() => {
                        setTopicView("default");
                        setSpotlightTopicId(row.id);
                      }}
                      className={`max-w-[11rem] truncate rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition ${
                        active
                          ? "border-emerald-600 bg-emerald-200/90 text-emerald-950 shadow-sm ring-1 ring-emerald-500/25 dark:border-emerald-500 dark:bg-emerald-900/55 dark:text-emerald-50"
                          : "border-emerald-200/90 bg-emerald-50/90 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100/90 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/50"
                      }`}
                    >
                      {row.data.title}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
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
              <BulletinExpandableBodyField
                label={
                  newCategory === "recipe_vote"
                    ? "レシピページのURL（1行に1件）"
                    : newCategory === "nearby_map"
                      ? "本文（任意）"
                      : "本文"
                }
                leadingActions={
                  newCategory !== "recipe_vote" ? (
                    <BulletinImageAttachButton
                      inputId={bulletinImgDashTopicId}
                      disabled={busy !== null}
                      onFile={(f) =>
                        void insertImageFromFile(
                          f,
                          newBody,
                          setNewBody,
                          newTopicBodyRef,
                          true,
                        )
                      }
                    />
                  ) : null
                }
                textareaRef={newTopicBodyRef}
                value={newBody}
                onChange={setNewBody}
                rows={newCategory === "recipe_vote" ? 5 : 4}
                placeholder={
                  newCategory === "recipe_vote"
                    ? "https://cookpad.com/jp/recipes/…"
                    : newCategory === "nearby_map"
                      ? "補足メモ（任意）"
                      : "本文"
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
          ) : visibleTopicRows.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-zinc-500 dark:text-zinc-400">
              該当する話題はありません。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {visibleTopicRows.map((row) => renderTopicRow(row))}
            </ul>
          )}
        </div>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

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
