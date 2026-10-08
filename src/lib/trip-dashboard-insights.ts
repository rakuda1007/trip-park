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
import type { BulletinRecipeVoteDoc } from "@/types/bulletin";
import {
  isStepRequired,
  isStepVisible,
  resolvePlanConfig,
} from "@/lib/plan-shape";
import {
  isDestinationStepCompleteForGroup,
  isItineraryCompleteForGroup,
} from "@/lib/trip-workflow-all-complete";
import { tripStatusLabel } from "@/lib/trip-status-labels";

export type DashboardPersonalTask = {
  key: string;
  label: string;
  href: string;
};

export type DashboardInsights = {
  /** ⑤ 次の一手（1行） */
  nextStepLine: string;
  /** 次の一手に対応するページへの導線（迷わず遷移できるように） */
  nextStepLink: { href: string; label: string } | null;
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
  /** recipe_vote で未確定かつ候補ありの連絡ごとの投票一覧 */
  openRecipeVotes: {
    topicId: string;
    title: string;
    candidateCount: number;
    votes: { userId: string; data: BulletinRecipeVoteDoc }[];
  }[];
  /** 未確定ブロックごとの全投票（個人集計用） */
  openDestinationPollVotes: { pollId: string; pollTitle: string; votes: VoteItem[] }[];
  userId: string | null;
  /** 日程の確定・候補の追加など（オーナー／管理者）。メンバー向け文言と切り替える */
  canManageSchedule: boolean;
  /** この旅行の参加世帯数（未登録だと精算できない） */
  familyCount?: number;
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
    canManageSchedule,
    familyCount = 0,
  } = params;

  const plan = resolvePlanConfig(group, destinationPolls.length);
  const datesDone = !!group.tripStartDate?.trim();
  const scheduleHasCandidates = scheduleCandidateIds.length > 0;
  const scheduleNeeded =
    isStepVisible(plan.schedule) && isStepRequired(plan.schedule);
  const destDone = isDestinationStepCompleteForGroup(group, destinationPolls);
  const itinDone = isItineraryCompleteForGroup(group, tripRoutes);
  const tripStatus = group.status ?? "planning";
  const settlementDone = tripStatus === "completed";
  const shape = plan.planShape;

  const statusLines: string[] = [];

  // ── 日程 ──
  if (!isStepVisible(plan.schedule)) {
    statusLines.push(`${plan.labels.schedule}の工程はこの予定では使いません。`);
  } else if (!datesDone) {
    if (scheduleHasCandidates) {
      statusLines.push(
        `${plan.labels.schedule}は候補が ${scheduleCandidateIds.length} 件あり、メンバーからの回答を募集中です（確定はオーナー・管理者）。`,
      );
    } else if (isStepRequired(plan.schedule)) {
      statusLines.push(
        `${plan.labels.schedule}はまだ確定していません。候補の追加または日付の直接設定が必要です。`,
      );
    } else {
      statusLines.push(
        `${plan.labels.schedule}は任意です（未設定でも精算へ進めます）。`,
      );
    }
  } else {
    statusLines.push(
      `${plan.labels.schedule}は ${formatScheduleShort(group.tripStartDate, group.tripEndDate)} が登録されています。`,
    );
  }

  // ── 場所 ──
  if (!isStepVisible(plan.place)) {
    statusLines.push(`${plan.labels.place}の工程はこの予定では使いません。`);
  } else if (plan.placeMode === "fixed") {
    statusLines.push(
      group.destination?.trim()
        ? `${plan.labels.place}は「${group.destination.trim()}」として登録されています。`
        : `${plan.labels.place}はまだ登録されていません。`,
    );
  } else if (destinationPolls.length === 0) {
    statusLines.push(
      group.destination?.trim()
        ? `${plan.labels.place}は「${group.destination.trim()}」として記録されています（投票ブロックなし）。`
        : `${plan.labels.place}は投票ブロックがまだなく、登録も未設定です。`,
    );
  } else {
    const undecided = destinationPolls.filter(
      (p) => normalizeDecidedNamesFromPollDoc(p.data).length === 0,
    );
    const decided = destinationPolls.length - undecided.length;
    if (undecided.length > 0) {
      statusLines.push(
        `${plan.labels.place}は投票ブロック ${destinationPolls.length} 件のうち、${undecided.length} 件が未確定です（確定済み ${decided} 件）。`,
      );
    } else {
      statusLines.push(
        `${plan.labels.place}は ${destinationPolls.length} 件のブロックすべて確定済みです。`,
      );
    }
  }

  // ── 旅程 ──
  if (!isStepVisible(plan.itinerary)) {
    statusLines.push(`${plan.labels.itinerary}の工程はこの予定では使いません。`);
  } else if (!itinDone) {
    const anyDone = tripRoutes.some((r) => r.data.isDone);
    statusLines.push(
      anyDone
        ? `${plan.labels.itinerary}は一部の日でルート確認が済んでいません。`
        : `${plan.labels.itinerary}はまだ登録・確認が終わっていない日があります。`,
    );
  } else {
    statusLines.push(`${plan.labels.itinerary}は全日の確認が済んでいます。`);
  }

  // ── 段階 ──
  if (tripStatus === "completed") {
    statusLines.push(
      `いまの段階は「${tripStatusLabel("completed", shape)}」です。支出の精算まで終えて締めました。`,
    );
  } else if (tripStatus === "confirmed") {
    statusLines.push(
      `いまの段階は「${tripStatusLabel("confirmed", shape)}」です。支出の記録と精算を進め、最後に締めます。`,
    );
  } else {
    statusLines.push(
      `いまの段階は「${tripStatusLabel("planning", shape)}」です。準備ができたら支出・精算へ進み、精算完了で締められます。`,
    );
  }

  const scheduleAnswersIncomplete =
    !!userId &&
    !datesDone &&
    scheduleHasCandidates &&
    !userHasScheduleAnswerForAllCandidates(
      userId,
      scheduleCandidateIds,
      scheduleResponses,
    );

  // ── 次の一手（優先順） ──
  let nextStepLine: string;
  let nextStepLink: { href: string; label: string } | null = null;

  if (scheduleNeeded && !datesDone) {
    if (scheduleHasCandidates) {
      nextStepLine = canManageSchedule
        ? `次のステップ: メンバーの回答を待つか、${plan.labels.schedule}を確定してください。`
        : "次のステップ: 各候補に ○／△／× で回答してください。";
    } else {
      nextStepLine = canManageSchedule
        ? `次のステップ: ${plan.labels.schedule}の候補を追加するか、日付を直接設定してください。`
        : `次のステップ: オーナー・管理者が${plan.labels.schedule}を登録するまでお待ちください。`;
    }
    nextStepLink = {
      href: `/groups/${groupId}/schedule#schedule-voting`,
      label: scheduleAnswersIncomplete
        ? `${plan.labels.schedule}で ○ / △ / × を選ぶ`
        : `${plan.labels.schedule}ページを開く`,
    };
  } else if (isStepVisible(plan.place) && !destDone) {
    nextStepLine =
      plan.placeMode === "fixed"
        ? `次のステップ: ${plan.labels.place}を登録してください。`
        : `次のステップ: ${plan.labels.place}の投票をしてください。`;
    nextStepLink = {
      href: `/groups/${groupId}/destination-votes#destination-voting`,
      label:
        plan.placeMode === "fixed"
          ? `${plan.labels.place}を登録する`
          : "投票ページを開く",
    };
  } else if (isStepVisible(plan.itinerary) && !itinDone) {
    nextStepLine = `次のステップ: ${plan.labels.itinerary}ページで各日のルートを埋め、確認済みにしてください。`;
    nextStepLink = {
      href: `/groups/${groupId}/trip`,
      label: `${plan.labels.itinerary}ページへ`,
    };
  } else if (!settlementDone) {
    nextStepLine =
      familyCount === 0
        ? "次のステップ: 支出・精算の前に参加世帯を登録してください。"
        : tripStatus === "confirmed"
          ? "次のステップ: 支出を記録し、精算結果を確認して締めましょう。"
          : "次のステップ: 支出・精算を進め、終わったら締めましょう。";
    nextStepLink = {
      href:
        familyCount === 0
          ? `/groups/${groupId}/families?setup=1`
          : `/groups/${groupId}/expenses?tab=settle`,
      label:
        familyCount === 0 ? "参加世帯を登録する" : "精算結果を確認する",
    };
  } else {
    nextStepLine =
      "すべての主要な工程が一通り完了しています。連絡で共有を続けられます。";
    nextStepLink = null;
  }

  // ── 個人タスク ──
  const personalTasks: DashboardPersonalTask[] = [];
  const nextStepIsDestination =
    isStepVisible(plan.place) &&
    !destDone &&
    (!scheduleNeeded || datesDone);

  if (userId) {
    // 精算で詰まらないよう、参加世帯未登録は早めに提示する
    if (familyCount === 0) {
      personalTasks.push({
        key: "families-setup",
        label: "支出・精算の前に、この旅行の参加世帯を登録してください。",
        href: `/groups/${groupId}/families?setup=1`,
      });
    }

    if (!nextStepIsDestination && plan.placeMode === "vote") {
      for (const row of openDestinationPollVotes) {
        const sum = sumUserDestinationWantVotes(userId, row.votes);
        if (sum === 0) {
          personalTasks.push({
            key: `dest-${row.pollId}`,
            label: `${plan.labels.place}の投票「${row.pollTitle.slice(0, 48)}${row.pollTitle.length > 48 ? "…" : ""}」にまだ票が入っていません。`,
            href: `/groups/${groupId}/destination-votes#destination-voting`,
          });
        }
      }
    }

    for (const rt of isStepVisible(plan.itinerary) ? openRecipeVotes : []) {
      const mine = rt.votes.find((v) => v.userId === userId);
      const n = rt.candidateCount;
      const ratedCount = mine
        ? countRatedCandidates(normalizeRecipeRatings(mine.data, n))
        : 0;
      if (ratedCount === 0) {
        personalTasks.push({
          key: `recipe-${rt.topicId}`,
          label: `献立のレシピ投票「${rt.title.slice(0, 40)}${rt.title.length > 40 ? "…" : ""}」でまだ評価していません。`,
          href: `/groups/${groupId}/bulletin/${rt.topicId}`,
        });
      }
    }
  }

  return { nextStepLine, nextStepLink, statusLines, personalTasks };
}
