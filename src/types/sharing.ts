/**
 * 買い出し・持ち寄り分担の1行
 * Firestore: groups/{groupId}/sharingItems/{itemId}
 */
export type SharingItemDoc = {
  /** 項目名（例: 肉・炭・飲み物） */
  label: string;
  /** 補足（数量・メモ） */
  memo: string | null;
  /** 担当ユーザー（未割当は null） */
  assignedUserId: string | null;
  assignedDisplayName: string | null;
  sortOrder: number;
  createdByUserId: string;
  createdByDisplayName: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
