"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  getGroup,
  getMemberForUser,
  leaveGroup,
  updateGroupDescription,
  updateGroupMemoryPhotoUrl,
  updateGroupName,
  updateGroupTripDates,
} from "@/lib/firestore/groups";
import { listDestinationPolls, type PollItem } from "@/lib/firestore/destination-votes";
import { listTripRoutes } from "@/lib/firestore/trip";
import {
  listBulletinTopicsWithReplyCounts,
  listRecipeVotes,
} from "@/lib/firestore/bulletin";
import { listFamilies } from "@/lib/firestore/families";
import { saveLastTripId } from "@/lib/last-trip";
import { uploadGroupMemoryPhoto } from "@/lib/storage/group-memory-photo";
import { areAllTripWorkflowStepsComplete } from "@/lib/trip-workflow-all-complete";
import { computeDashboardInsights } from "@/lib/trip-dashboard-insights";
import { listScheduleCandidates, listScheduleResponses } from "@/lib/firestore/schedule";
import {
  listDestinationVotes,
  type VoteItem,
} from "@/lib/firestore/destination-votes";
import { normalizeDecidedNamesFromPollDoc } from "@/lib/destination-poll-decided";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type { ScheduleResponseDoc } from "@/types/schedule";
import type {
  BulletinRecipeVoteDoc,
  BulletinTopicDoc,
} from "@/types/bulletin";
import type { TripRouteDoc } from "@/types/trip";
import { VisibilityBadge } from "@/components/visibility-badge";
import { TripDashboardInsightsPanel } from "@/components/trip/trip-dashboard-insights-panel";
import { TripHomeContactSummary } from "@/components/trip/trip-home-contact-summary";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

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
  familyCount: number;
};

export function GroupDetailClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 旅行名編集用
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  // 旅行日程編集用
  const [editingDates, setEditingDates] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

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

  // 連絡（洞察パネルのレシピ投票用にも利用）
  const [topics, setTopics] = useState<
    { id: string; data: BulletinTopicDoc; replyCount: number }[]
  >([]);
  const [dashboardExtras, setDashboardExtras] =
    useState<DashboardExtrasState | null>(null);
  /** 旅行ホームの次の一手文言（オーナー／管理者向け）用 */
  const [myMember, setMyMember] = useState<MemberDoc | null>(null);

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
        const [cands, resps, families] = await Promise.all([
          listScheduleCandidates(groupId),
          listScheduleResponses(groupId),
          listFamilies(groupId).catch(() => []),
        ]);
        const scheduleCandidateIds = cands.map((c) => c.id);
        const scheduleResponses = resps.map((r) => r.data);
        const familyCount = families.length;

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
          familyCount,
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
      familyCount: dashboardExtras.familyCount,
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
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 pt-2 sm:pb-12 sm:pt-3">
      {/* 旅行名 + 日程バッジ */}
      {editingName && isOwner ? (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
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
        <div className="mt-1 flex flex-wrap items-center gap-3">
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
        <div className="mt-1.5 flex items-start gap-2">
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
      <section className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
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
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              開始日
              <input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              終了日
              <input
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                min={draftStart || undefined}
                className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
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

      <TripHomeContactSummary groupId={groupId} topics={topics} />

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
      </div>
    </div>
  );
}
