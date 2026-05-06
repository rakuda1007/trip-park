export type GroupRole = "owner" | "admin" | "member";

/** 旅行のフェーズ: 計画中 / 旅行確定 / 旅行終了 */
export type TripStatus = "planning" | "confirmed" | "completed";

export type GroupDoc = {
  name: string;
  description: string | null;
  /** 旅行の思い出写真（サムネイル表示用） */
  memoryPhotoUrl?: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: unknown;
  updatedAt: unknown;
  /** 旅行開始日 YYYY-MM-DD。日程確定またはオーナーが手動設定 */
  tripStartDate: string | null;
  /** 旅行終了日 YYYY-MM-DD */
  tripEndDate: string | null;
  /** 確定した目的地名 */
  destination: string | null;
  /** 旅行フェーズ。未設定の場合は "planning" とみなす */
  status: TripStatus | null;
};

export type MemberDoc = {
  role: GroupRole;
  joinedAt: unknown;
  displayName: string | null;
  /** 最終アクセス日時。グループページを開くたびに更新 */
  lastAccessAt?: unknown;
};

/** 参加時の検証用。保存後に deleteField で削除する */
export type MemberDocWithJoinCode = MemberDoc & { code: string };

export type UserGroupRefDoc = {
  groupId: string;
  groupName: string;
  memoryPhotoUrl?: string | null;
  role: GroupRole;
  joinedAt: unknown;
  /** listMyGroups でグループ本体から取得してマージ */
  tripStartDate?: string | null;
  tripEndDate?: string | null;
};

export type InviteCodeDoc = {
  groupId: string;
  groupName: string;
  createdAt: unknown;
};
