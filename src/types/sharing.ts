/**
 * 買い出し・持ち寄り分担の1行
 * Firestore: groups/{groupId}/sharingItems/{itemId}
 */
export type SharingItemDoc = {
  /** 項目名（例: 肉・炭・飲み物） */
  label: string;
  /** 補足（数量・メモ） */
  memo: string | null;
  /** 担当世帯（参加世帯）。未割当は null */
  assignedFamilyId: string | null;
  /** 割当時の世帯名（表示用キャッシュ） */
  assignedFamilyName: string | null;
  /** 世帯まとめでの購入チェック用（集計の□／☑） */
  purchased: boolean;
  sortOrder: number;
  createdByUserId: string;
  createdByDisplayName: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
