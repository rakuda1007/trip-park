/** 掲示板カテゴリ（仕様の例に対応） */
export type BulletinCategory =
  | "general"
  | "gear"
  | "dayof"
  | "other"
  | "recipe_vote";

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

export const BULLETIN_CATEGORY_LABELS: Record<BulletinCategory, string> = {
  general: "全体連絡",
  gear: "持ち物",
  dayof: "当日の連絡",
  other: "その他",
  recipe_vote: "レシピ投票",
};

export const BULLETIN_CATEGORY_OPTIONS: BulletinCategory[] = [
  "general",
  "gear",
  "dayof",
  "other",
  "recipe_vote",
];

/** 重要度 */
export type BulletinImportance = "normal" | "important";

/** 話題（スレッドの親）。`bulletinPosts/{topicId}` に保存 */
export type BulletinTopicDoc = {
  title: string;
  body: string;
  authorUserId: string;
  authorDisplayName: string | null;
  category: BulletinCategory;
  importance: BulletinImportance;
  pinned: boolean;
  /** カテゴリが recipe_vote のとき、候補のプレビュー（画像・材料） */
  recipePoll?: RecipePollData;
  createdAt: unknown;
  updatedAt: unknown;
};

/** `bulletinPosts/{topicId}/recipeVotes/{userId}` — 1人1票 */
export type BulletinRecipeVoteDoc = {
  candidateIndex: number;
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
