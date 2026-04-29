/** 掲示板カテゴリ（仕様の例に対応） */
export type BulletinCategory =
  | "general"
  | "gear"
  | "dayof"
  | "other"
  | "recipe_vote"
  | "nearby_map";

export type NearbyMapSpot = {
  name: string;
  url: string;
};

/** レシピ投票でプレビューに保存する候補（URL 先から取得） */
export type RecipePollCandidate = {
  url: string;
  sourceTitle: string | null;
  imageUrl: string | null;
  ingredients: string[];
  fetchError: string | null;
};

export type RecipePollData = {
  candidates: RecipePollCandidate[];
};

/** 旅程に紐づける食事枠 */
export type RecipeMealSlot = "breakfast" | "lunch" | "dinner";

export const RECIPE_MEAL_LABELS: Record<RecipeMealSlot, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
};

/** レシピ投票の確定（旅程 Day タブに表示） */
export type RecipePollResolution = {
  confirmedByUserId: string;
  confirmedAt: unknown;
  assignments: RecipeMealAssignment[];
};

export type RecipeMealAssignment = {
  dayNumber: number;
  meal: RecipeMealSlot;
  candidateIndex: number;
};

export const BULLETIN_CATEGORY_LABELS: Record<BulletinCategory, string> = {
  general: "全体連絡",
  gear: "持ち物",
  dayof: "当日の連絡",
  other: "その他",
  recipe_vote: "レシピ投票",
  nearby_map: "周辺地図",
};

export const BULLETIN_CATEGORY_OPTIONS: BulletinCategory[] = [
  "general",
  "gear",
  "dayof",
  "other",
  "recipe_vote",
  "nearby_map",
];

/** 重要度 */
export type BulletinImportance = "normal" | "important";

/** トピックに付与できるタグ（複数可） */
export type BulletinTopicTag = "recipe" | "movement" | "priority_top";

export const BULLETIN_TOPIC_TAG_LABELS: Record<BulletinTopicTag, string> = {
  recipe: "レシピ",
  movement: "移動",
  priority_top: "上位表示",
};

export const BULLETIN_TOPIC_TAG_ALL: BulletinTopicTag[] = [
  "recipe",
  "movement",
  "priority_top",
];

/** 話題（スレッドの親）。`bulletinPosts/{topicId}` に保存 */
export type BulletinTopicDoc = {
  title: string;
  body: string;
  authorUserId: string;
  authorDisplayName: string | null;
  category: BulletinCategory;
  importance: BulletinImportance;
  pinned: boolean;
  /** 付与したタグ（未設定の旧データは空配列として扱う） */
  tags?: BulletinTopicTag[];
  /** カテゴリが recipe_vote のとき、候補のプレビュー（画像・材料） */
  recipePoll?: RecipePollData;
  /** カテゴリが nearby_map のとき、立ち寄り先の一覧 */
  nearbyMapSpots?: NearbyMapSpot[];
  /** 投票確定後の食事割当（旅程で参照） */
  recipePollResolution?: RecipePollResolution;
  createdAt: unknown;
  updatedAt: unknown;
};

/** Firestore / 旧データから正規化 */
export function normalizeBulletinTopicTags(
  data: Pick<BulletinTopicDoc, "tags">,
): BulletinTopicTag[] {
  const raw = data.tags;
  if (!raw || !Array.isArray(raw)) return [];
  const allowed = new Set<string>(BULLETIN_TOPIC_TAG_ALL);
  const seen = new Set<string>();
  const out: BulletinTopicTag[] = [];
  for (const t of raw) {
    if (typeof t !== "string" || !allowed.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t as BulletinTopicTag);
  }
  return out;
}

/** `bulletinPosts/{topicId}/recipeVotes/{userId}` — 候補ごとに 1〜5 点（最大5候補まで評価） */
export type BulletinRecipeVoteDoc = {
  /** 候補と同じ長さ。0=未評価、1〜5=点数 */
  ratings: number[];
  /** @deprecated 旧1票。読み取り互換のみ */
  candidateIndex?: number;
  updatedAt: unknown;
};

/** @deprecated BulletinTopicDoc を使用してください */
export type BulletinPostDoc = BulletinTopicDoc;

/** 返信の既読位置。`bulletinPosts/{topicId}/replyReadProgress/{userId}` */
export type BulletinTopicReplyReadProgressDoc = {
  lastReadReplyId: string | null;
  updatedAt: unknown;
};

/** 話題への返信。`bulletinPosts/{topicId}/replies/{replyId}` に保存 */
export type BulletinReplyDoc = {
  body: string;
  authorUserId: string;
  authorDisplayName: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
