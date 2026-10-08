import { normalizeDecidedNamesFromPollDoc } from "@/lib/destination-poll-decided";
import {
  isStepRequired,
  isStepVisible,
  resolvePlanConfig,
} from "@/lib/plan-shape";
import type { DestinationPollDoc } from "@/types/destination";
import type { GroupDoc } from "@/types/group";
import type { TripRouteDoc } from "@/types/trip";

/** listDestinationPolls の行と同形（firestore の PollItem と互換） */
export type DestinationPollRow = { id: string; data: DestinationPollDoc };

/** 旅程ページ・ステップナビと同じ日数計算 */
export function calcTripNumDaysFromGroup(
  start: string | null,
  end: string | null,
): number {
  if (!start) return 0;
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** 場所工程の完了判定（placeMode / 工程OFF を考慮） */
export function isDestinationStepCompleteForGroup(
  group: GroupDoc,
  polls: DestinationPollRow[],
): boolean {
  const config = resolvePlanConfig(group, polls.length);
  if (!isStepVisible(config.place) || config.placeMode === "skip") {
    return true;
  }
  if (config.placeMode === "fixed") {
    return !!(group.destination?.trim() || group.placeFixed?.name?.trim());
  }
  // vote
  if (polls.length === 0) {
    return !!group.destination?.trim();
  }
  return polls.every(
    (p) => normalizeDecidedNamesFromPollDoc(p.data).length > 0,
  );
}

/**
 * TripStepNavBar と同じ旅程完了判定:
 * Day1〜Day(numTripDays) それぞれに旅程があり、当日の全ブロックが isDone。
 */
export function isItineraryCompleteForGroup(
  group: GroupDoc | null,
  tripRoutes: { id: string; data: TripRouteDoc }[],
): boolean {
  if (!group) return false;
  const config = resolvePlanConfig(group);
  if (!isStepVisible(config.itinerary)) return true;

  const fromDates = calcTripNumDaysFromGroup(
    group.tripStartDate ?? null,
    group.tripEndDate ?? null,
  );
  const maxRoute = tripRoutes.reduce(
    (m, r) => Math.max(m, r.data.dayNumber),
    0,
  );
  const numTripDays = Math.max(fromDates, maxRoute, 1);

  for (let d = 1; d <= numTripDays; d++) {
    const forDay = tripRoutes.filter((r) => r.data.dayNumber === d);
    if (forDay.length === 0) return false;
    if (forDay.some((r) => !r.data.isDone)) return false;
  }
  return true;
}

function isScheduleStepComplete(group: GroupDoc): boolean {
  const config = resolvePlanConfig(group);
  if (!isStepVisible(config.schedule)) return true;
  if (!isStepRequired(config.schedule)) return true;
  return !!group.tripStartDate?.trim();
}

/**
 * 有効な必須工程がすべて完了したときのみ true。
 * 思い出写真の表示・一覧サムネイルに利用する。
 */
export function areAllTripWorkflowStepsComplete(
  group: GroupDoc | null,
  destinationPolls: DestinationPollRow[],
  tripRoutes: { id: string; data: TripRouteDoc }[],
): boolean {
  if (!group) return false;
  const scheduleDone = isScheduleStepComplete(group);
  const destDone = isDestinationStepCompleteForGroup(group, destinationPolls);
  const itinDone = isItineraryCompleteForGroup(group, tripRoutes);
  const settlementDone = (group.status ?? "planning") === "completed";
  return scheduleDone && destDone && itinDone && settlementDone;
}

/**
 * ボトムナビ「計画」など用: 有効な未完了の最初の計画工程へ。
 * 計画工程がすべて不要／完了なら精算へ。
 */
export function resolveNextPlanPath(
  groupId: string,
  group: GroupDoc | null,
  destinationPolls: DestinationPollRow[],
  tripRoutes: { id: string; data: TripRouteDoc }[],
): string {
  const base = `/groups/${groupId}`;
  if (!group) return `${base}/schedule`;

  const config = resolvePlanConfig(group, destinationPolls.length);

  if (isStepVisible(config.schedule) && isStepRequired(config.schedule)) {
    if (!group.tripStartDate?.trim()) return `${base}/schedule`;
  }
  if (isStepVisible(config.place)) {
    if (!isDestinationStepCompleteForGroup(group, destinationPolls)) {
      return `${base}/destination-votes`;
    }
  }
  if (isStepVisible(config.itinerary)) {
    if (!isItineraryCompleteForGroup(group, tripRoutes)) {
      return `${base}/trip`;
    }
    return `${base}/trip`;
  }
  return `${base}/expenses?tab=settle`;
}
