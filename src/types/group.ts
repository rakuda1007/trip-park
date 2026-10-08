export type GroupRole = "owner" | "admin" | "member";

/** 旅行のフェーズ: 計画中 / 旅行確定 / 旅行終了 */
export type TripStatus = "planning" | "confirmed" | "completed";

/** 予定の形（旅行 / 飲み会・食事 / シンプル精算） */
export type PlanShape = "trip" | "gathering" | "settle_only";

/** 場所工程の決め方 */
export type PlaceMode = "vote" | "fixed" | "skip";

export type StepAvailability = "required" | "optional" | "off";

export type PlaceFixed = {
  name: string;
  mapUrl?: string | null;
  note?: string | null;
};

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
  /** 確定した目的地名（お店名）。一覧・ナビ要約用 */
  destination: string | null;
  /** 旅行フェーズ。未設定の場合は "planning" とみなす */
  status: TripStatus | null;
  /** 予定の形。未設定は trip（レガシー互換） */
  planShape?: PlanShape | null;
  /** 場所の決め方。未設定は形とデータから推定 */
  placeMode?: PlaceMode | null;
  /** fixed 用の詳細（destination と併用） */
  placeFixed?: PlaceFixed | null;
  /** 工程の上書き。未設定は形のデフォルト */
  stepOverrides?: {
    schedule?: StepAvailability;
    place?: StepAvailability;
    itinerary?: StepAvailability;
    sharing?: "on" | "off";
  } | null;
};

export type MemberDoc = {
  role: GroupRole;
  joinedAt: unknown;
  displayName: string | null;
  /** 最終アクセス日時。旅行ページを開くたびに更新 */
  lastAccessAt?: unknown;
};

/** 参加時の検証用。保存後に deleteField で削除する */
export type MemberDocWithJoinCode = MemberDoc & { code: string };

export type UserGroupRefDoc = {
  groupId: string;
  groupName: string;
  memoryPhotoUrl?: string | null;
  status?: TripStatus | null;
  role: GroupRole;
  joinedAt: unknown;
  /** listMyGroups で旅行本体から取得してマージ */
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  /** 思い出サムネイルを一覧に出してよいか（日程・目的地・旅程・精算がすべて完了のとき true） */
  memoryPhotoVisible?: boolean;
  /** 予定の形（一覧バッジ用） */
  planShape?: PlanShape | null;
};

export type InviteCodeDoc = {
  groupId: string;
  groupName: string;
  createdAt: unknown;
  /** 招待プレビュー用。未設定は trip 扱い */
  planShape?: PlanShape | null;
};
