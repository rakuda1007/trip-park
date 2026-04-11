/** 掲示板カテゴリ（仕様の例に対応） */
export type BulletinCategory = "general" | "gear" | "dayof" | "other";

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
  createdAt: unknown;
  updatedAt: unknown;
};

/** @deprecated BulletinTopicDoc を使用してください */
export type BulletinPostDoc = BulletinTopicDoc;

/** 話題への返信。`bulletinPosts/{topicId}/replies/{replyId}` に保存 */
export type BulletinReplyDoc = {
  body: string;
  authorUserId: string;
  authorDisplayName: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
