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

/** 投票の回答 */
export type DestinationAnswer = "first" | "want" | "reserve";

/**
 * 目的地候補への投票
 * Firestore: groups/{groupId}/destinationPolls/{pollId}/destinationVotes/{userId}_{candidateId}
 * （レガシー: groups/{groupId}/destinationVotes/{userId}_{candidateId}）
 */
export type DestinationVoteDoc = {
  candidateId: string;
  userId: string;
  answer: DestinationAnswer;
  updatedAt: unknown;
};
