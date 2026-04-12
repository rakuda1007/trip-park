/**
 * 目的地候補
 * Firestore: groups/{groupId}/destinationCandidates/{id}
 */
export type DestinationCandidateDoc = {
  /** 候補名（例: "沖縄"） */
  name: string;
  /** 補足説明（費用目安など） */
  description: string | null;
  proposedByUserId: string;
  proposedByDisplayName: string | null;
  createdAt: unknown;
};

/** 投票の回答 */
export type DestinationAnswer = "want" | "ok" | "no";

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
