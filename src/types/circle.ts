/**
 * サークル（連絡先グループ）
 * Firestore: circles/{circleId}
 * オーナーが旅行招待相手をグループ化して管理するための名簿
 */
export type CircleDoc = {
  /** サークル名 */
  name: string;
  /** 作成者の UID */
  ownerId: string;
  createdAt: unknown;
  updatedAt: unknown;
};

/**
 * サークルメンバー
 * Firestore: circles/{circleId}/members/{memberId}
 */
export type CircleMemberDoc = {
  /** 表示名 */
  displayName: string;
  /** Trip Park アカウント UID（未登録の場合は null） */
  userId: string | null;
  /** メモ（連絡先などの備考） */
  note: string | null;
  addedAt: unknown;
};
