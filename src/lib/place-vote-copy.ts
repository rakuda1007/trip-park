import type { GroupDoc } from "@/types/group";

/** 場所投票の用途: 拠点決め vs 立ち寄り */
export type PlaceVoteKind = "destination" | "stopover";

/** 主な目的地（拠点）が登録済みか */
export function isMainPlaceRegistered(
  group: Pick<GroupDoc, "destination" | "placeFixed"> | null | undefined,
): boolean {
  if (!group) return false;
  return !!(
    group.placeFixed?.name?.trim() || group.destination?.trim()
  );
}

export function placeVoteCopy(
  kind: PlaceVoteKind,
  placeLabel: string,
): {
  pageTitle: string;
  pageLead: string;
  hubSummaryLabel: string;
  shareVerb: string;
  addBlockButton: string;
  addBlockHeading: string;
  titlePlaceholder: string;
  defaultBlockTitle: (blockIndex1Based: number) => string;
  candidateNoun: string;
  decideMaxError: (max: number) => string;
} {
  if (kind === "stopover") {
    return {
      pageTitle: "立ち寄りの投票",
      pageLead:
        "主な目的地は決まっています。途中で寄る場所を、投票ブロックで決められます。",
      hubSummaryLabel: "主な目的地（確定）",
      shareVerb: "立ち寄りを決める",
      addBlockButton: "＋ 立ち寄りの投票を追加",
      addBlockHeading: "立ち寄りの投票ブロックを追加",
      titlePlaceholder: "例: 1日目の立ち寄り",
      defaultBlockTitle: (n) =>
        n <= 1 ? "1日目の立ち寄り" : `${n}日目の立ち寄り`,
      candidateNoun: "立ち寄り先",
      decideMaxError: (max) =>
        `確定できる立ち寄りはこのブロックで最大${String(max)}件までです。`,
    };
  }

  return {
    pageTitle: `${placeLabel}を決める`,
    pageLead:
      "まだ主な目的地が決まっていないときに使います。投票ブロックで候補を出し、メンバーが票を入れます。",
    hubSummaryLabel: "いまの登録（旅行トップにも表示）",
    shareVerb: `${placeLabel}を決める`,
    addBlockButton: "＋ 投票ブロックを追加（日別など）",
    addBlockHeading: "投票ブロックを追加",
    titlePlaceholder: `例: 1日目の${placeLabel}`,
    defaultBlockTitle: (n) =>
      n <= 1 ? `1日目の${placeLabel}` : `${n}日目の${placeLabel}`,
    candidateNoun: placeLabel,
    decideMaxError: (max) =>
      `確定できる${placeLabel}はこのブロックで最大${String(max)}件までです。`,
  };
}
