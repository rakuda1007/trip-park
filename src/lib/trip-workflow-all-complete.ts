import { normalizeDecidedNamesFromPollDoc } from "@/lib/destination-poll-decided";
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

/** TripStepNavBar と同じ目的地ステップ完了判定 */
export function isDestinationStepCompleteForGroup(
  group: GroupDoc,
  polls: DestinationPollRow[],
): boolean {
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

/**
 * 日程・目的地・旅程・精算の各工程がすべて完了したときのみ true。
 * 思い出写真の表示・一覧サムネイルに利用する。
 */
export function areAllTripWorkflowStepsComplete(
  group: GroupDoc | null,
  destinationPolls: DestinationPollRow[],
  tripRoutes: { id: string; data: TripRouteDoc }[],
): boolean {
  if (!group) return false;
  const scheduleDone = !!group.tripStartDate;
  const destDone = isDestinationStepCompleteForGroup(group, destinationPolls);
  const itinDone = isItineraryCompleteForGroup(group, tripRoutes);
  const settlementDone = (group.status ?? "planning") === "completed";
  return scheduleDone && destDone && itinDone && settlementDone;
}
