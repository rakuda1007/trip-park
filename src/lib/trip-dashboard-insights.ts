import type { PollItem, VoteItem } from "@/lib/firestore/destination-votes";
import { wantVoteWeightFromDoc } from "@/lib/firestore/destination-votes";
import { normalizeDecidedNamesFromPollDoc } from "@/lib/destination-poll-decided";
import {
  countRatedCandidates,
  normalizeRecipeRatings,
} from "@/lib/recipe-vote";
import type { ScheduleResponseDoc } from "@/types/schedule";
import type { GroupDoc } from "@/types/group";
import type { TripRouteDoc } from "@/types/trip";
import type { BulletinRecipeVoteDoc, BulletinTopicDoc } from "@/types/bulletin";
import {
  isDestinationStepCompleteForGroup,
  isItineraryCompleteForGroup,
} from "@/lib/trip-workflow-all-complete";

/** トピック一覧の「投票・決定系」フィルタ（掲示） */
export function isVoteOrDecisionTopic(data: BulletinTopicDoc): boolean {
  if (data.category === "recipe_vote") return true;
  if (data.importance === "important") return true;
  const tags = data.tags;
  if (Array.isArray(tags) && tags.includes("priority_top")) return true;
  return false;
}

export type DashboardPersonalTask = {
  key: string;
  label: string;
  href: string;
};

export type DashboardInsights = {
  /** ⑤ 次の一手（1行） */
  nextStepLine: string;
  /** ④ 自動のみ・旅行全体の状況（箇条書き） */
  statusLines: string[];
  /** ② あなたへのお願い（未対応があれば） */
  personalTasks: DashboardPersonalTask[];
};

function formatScheduleShort(start: string | null, end: string | null): string {
  if (!start) return "";
  const [sy, sm, sd] = start.split("-").map(Number);
  if (!sy || Number.isNaN(sy)) return start;
  if (!end || end === start) return `${sy}/${sm}/${sd}`;
  const [, em, ed] = end.split("-").map(Number);
  return `${sy}/${sm}/${sd}〜${em}/${ed}`;
}

function userHasScheduleAnswerForAllCandidates(
  userId: string,
  candidateIds: string[],
  responses: ScheduleResponseDoc[],
): boolean {
  if (candidateIds.length === 0) return true;
  const answered = new Set(
    responses
      .filter((r) => r.userId === userId)
      .map((r) => r.candidateId),
  );
  return candidateIds.every((id) => answered.has(id));
}

function sumUserDestinationWantVotes(
  userId: string,
  votes: VoteItem[],
): number {
  let s = 0;
  for (const v of votes) {
    if (v.data.userId !== userId) continue;
    s += wantVoteWeightFromDoc(v.data);
  }
  return s;
}

export function computeDashboardInsights(params: {
  groupId: string;
  group: GroupDoc;
  destinationPolls: PollItem[];
  tripRoutes: { id: string; data: TripRouteDoc }[];
  scheduleCandidateIds: string[];
  scheduleResponses: ScheduleResponseDoc[];
  /** recipe_vote で未確定かつ候補ありのトピックごとの投票一覧 */
  openRecipeVotes: {
    topicId: string;
    title: string;
    candidateCount: number;
    votes: { userId: string; data: BulletinRecipeVoteDoc }[];
  }[];
  /** 未確定ブロックごとの全投票（個人集計用） */
  openDestinationPollVotes: { pollId: string; pollTitle: string; votes: VoteItem[] }[];
  userId: string | null;
}): DashboardInsights {
  const {
    groupId,
    group,
    destinationPolls,
    tripRoutes,
    scheduleCandidateIds,
    scheduleResponses,
    openRecipeVotes,
    openDestinationPollVotes,
    userId,
  } = params;

  const datesDone = !!group.tripStartDate?.trim();
  const scheduleHasCandidates = scheduleCandidateIds.length > 0;
  const destDone = isDestinationStepCompleteForGroup(group, destinationPolls);
  const itinDone = isItineraryCompleteForGroup(group, tripRoutes);
  const tripStatus = group.status ?? "planning";
  const settlementDone = tripStatus === "completed";

  const statusLines: string[] = [];

  // ── 日程 ──
  if (!datesDone) {
    if (scheduleHasCandidates) {
      statusLines.push(
        `日程は候補が ${scheduleCandidateIds.length} 件あり、メンバーからの回答を募集中です（確定はオーナー・管理者）。`,
      );
    } else {
      statusLines.push(
        "日程はまだ旅行日として確定していません。候補の追加または日程の直接設定が必要です。",
      );
    }
  } else {
    statusLines.push(
      `日程は ${formatScheduleShort(group.tripStartDate, group.tripEndDate)} が登録されています。`,
    );
  }

  // ── 目的地 ──
  if (destinationPolls.length === 0) {
    statusLines.push(
      group.destination?.trim()
        ? `目的地は「${group.destination.trim()}」として記録されています（投票ブロックなし）。`
        : "目的地は投票ブロックがまだなく、グループの目的地欄も未設定です。",
    );
  } else {
    const undecided = destinationPolls.filter(
      (p) => normalizeDecidedNamesFromPollDoc(p.data).length === 0,
    );
    const decided = destinationPolls.length - undecided.length;
    if (undecided.length > 0) {
      statusLines.push(
        `目的地は投票ブロック ${destinationPolls.length} 件のうち、${undecided.length} 件が未確定です（確定済み ${decided} 件）。`,
      );
    } else {
      statusLines.push(
        `目的地は ${destinationPolls.length} 件のブロックすべて確定済みです。`,
      );
    }
  }

  // ── 旅程 ──
  if (!itinDone) {
    const anyDone = tripRoutes.some((r) => r.data.isDone);
    statusLines.push(
      anyDone
        ? "旅程は一部の日でルート確認が済んでいません。"
        : "旅程はまだ登録・確認が終わっていない日があります。",
    );
  } else {
    statusLines.push("旅程は全日の確認が済んでいます。");
  }

  // ── 精算 ──
  if (tripStatus === "completed") {
    statusLines.push("支出・精算は完了済みとして記録されています。");
  } else if (tripStatus === "confirmed") {
    statusLines.push("旅行は確定済みです。支出・精算の記録・完了ステップが残っています。");
  } else {
    statusLines.push("旅行フェーズは「計画中」です（精算完了で締められます）。");
  }

  // ── 次の一手（優先順） ──
  let nextStepLine: string;
  if (!datesDone) {
    nextStepLine = scheduleHasCandidates
      ? "次のステップ: 日程候補への回答を進めるか、管理者が日程を確定してください。"
      : "次のステップ: 日程候補を追加するか、旅行日を設定してください。";
  } else if (!destDone) {
    nextStepLine =
      "次のステップ: 目的地の投票に参加し、オーナー・管理者による確定を進めてください。";
  } else if (!itinDone) {
    nextStepLine =
      "次のステップ: 旅程ページで各日のルートを埋め、確認済みにしてください。";
  } else if (!settlementDone) {
    nextStepLine =
      tripStatus === "confirmed"
        ? "次のステップ: 支出・精算ページで清算を進め、旅行を完了にしてください。"
        : "次のステップ: 旅行を確定したうえで、支出・精算を進めてください。";
  } else {
    nextStepLine =
      "すべての主要な工程が一通り完了しています。トピックで連絡・共有を続けられます。";
  }

  // ── 個人タスク ──
  const personalTasks: DashboardPersonalTask[] = [];
  if (userId) {
    if (!datesDone && scheduleHasCandidates) {
      const ok = userHasScheduleAnswerForAllCandidates(
        userId,
        scheduleCandidateIds,
        scheduleResponses,
      );
      if (!ok) {
        personalTasks.push({
          key: "schedule",
          label: "日程候補への回答がまだ終わっていません（○/△/×）。",
          href: `/groups/${groupId}/schedule`,
        });
      }
    }

    for (const row of openDestinationPollVotes) {
      const sum = sumUserDestinationWantVotes(userId, row.votes);
      if (sum === 0) {
        personalTasks.push({
          key: `dest-${row.pollId}`,
          label: `目的地の投票「${row.pollTitle.slice(0, 48)}${row.pollTitle.length > 48 ? "…" : ""}」にまだ票が入っていません。`,
          href: `/groups/${groupId}/destination-votes`,
        });
      }
    }

    for (const rt of openRecipeVotes) {
      const mine = rt.votes.find((v) => v.userId === userId);
      const n = rt.candidateCount;
      const ratedCount = mine
        ? countRatedCandidates(normalizeRecipeRatings(mine.data, n))
        : 0;
      if (ratedCount === 0) {
        personalTasks.push({
          key: `recipe-${rt.topicId}`,
          label: `レシピ投票「${rt.title.slice(0, 40)}${rt.title.length > 40 ? "…" : ""}」でまだ評価していません。`,
          href: `/groups/${groupId}/bulletin/${rt.topicId}`,
        });
      }
    }
  }

  return { nextStepLine, statusLines, personalTasks };
}
