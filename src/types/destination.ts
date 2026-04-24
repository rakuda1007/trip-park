/**
 * 目的地投票ブロック（例: 1日目の目的地、2日目の目的地）
 * Firestore: groups/{groupId}/destinationPolls/{pollId}
 */
export type DestinationPollDoc = {
  /** 表示タイトル（例: 「1日目の目的地」） */
  title: string;
  /** 並び順（小さいほど上） */
  sortOrder: number;
  /** オーナーが確定した目的地名（候補の name と一致）。未確定は null */
  decidedDestinationName: string | null;
  createdByUserId: string;
  createdAt: unknown;
  updatedAt: unknown;
};

/**
 * 目的地候補
 * Firestore: groups/{groupId}/destinationPolls/{pollId}/destinationCandidates/{id}
 * （レガシー: groups/{groupId}/destinationCandidates/{id}）
 */
export type DestinationCandidateDoc = {
  /** 候補名（例: "沖縄"） */
  name: string;
  /** 参考URL（任意） */
  url: string | null;
  /** 一泊あたりの費用（必須） */
  costPerNight: number;
  /** 補足説明（任意） */
  description: string | null;
  proposedByUserId: string;
  proposedByDisplayName: string | null;
  createdAt: unknown;
};

/** 旧3段階の投票。移行中データ・読み取り用 */
export type DestinationAnswer = "first" | "want" | "reserve";

/**
 * 目的地候補への投票
 * Firestore: groups/{groupId}/destinationPolls/{pollId}/destinationVotes/{userId}_{candidateId}
 * （レガシー: groups/{groupId}/destinationVotes/{userId}_{candidateId}）
 */
export type DestinationVoteDoc = {
  candidateId: string;
  userId: string;
  /**
   * 「行きたい」票の数。1 人あたり全候補で合計 3 まで（同一候補に 1〜3）。
   * 新形式。未設定のときは旧 `answer` から正規化。
   */
  count?: number;
  /** 旧3段階。count が無い場合の表示に使用 */
  answer?: DestinationAnswer;
  updatedAt: unknown;
};

/** 1 人あたり1投票ブロック内に使える「行きたい」票の上限 */
export const DESTINATION_WANT_VOTES_MAX_PER_USER = 3;
