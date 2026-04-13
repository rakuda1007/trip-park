/**
 * 目的地候補
 * Firestore: groups/{groupId}/destinationCandidates/{id}
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
 * Firestore: groups/{groupId}/destinationVotes/{userId}_{candidateId}
 */
export type DestinationVoteDoc = {
  candidateId: string;
  userId: string;
  answer: DestinationAnswer;
  updatedAt: unknown;
};
