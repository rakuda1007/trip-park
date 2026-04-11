/**
 * Firestore コレクション名
 */
export const COLLECTIONS = {
  users: "users",
  groups: "groups",
  inviteCodes: "inviteCodes",
} as const;

export const SUB = {
  members: "members",
  groups: "groups",
  scheduleCandidates: "scheduleCandidates",
  scheduleResponses: "scheduleResponses",
  config: "config",
  bulletinPosts: "bulletinPosts",
  /** bulletinPosts/{topicId}/replies */
  replies: "replies",
  tripRoutes: "tripRoutes",
  expenses: "expenses",
  families: "families",
} as const;

/** groups/{groupId}/config/{docId} の確定情報 */
export const SCHEDULE_CONFIG_DOC = "schedule";
