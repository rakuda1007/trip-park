/**
 * Firestore コレクション名
 */
export const COLLECTIONS = {
  users: "users",
  groups: "groups",
  inviteCodes: "inviteCodes",
  circles: "circles",
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
  /** bulletinPosts/{topicId}/replyReadProgress/{userId} */
  replyReadProgress: "replyReadProgress",
  /** bulletinPosts/{topicId}/recipeVotes/{userId} レシピ投票 */
  recipeVotes: "recipeVotes",
  tripRoutes: "tripRoutes",
  expenses: "expenses",
  families: "families",
  /** users/{uid}/households/{householdId} */
  households: "households",
  /** groups/{groupId}/destinationCandidates/{id}（レガシー・移行後は未使用） */
  destinationCandidates: "destinationCandidates",
  /** groups/{groupId}/destinationVotes/{docId}（レガシー） */
  destinationVotes: "destinationVotes",
  /** groups/{groupId}/destinationPolls/{pollId} 日別などの投票ブロック */
  destinationPolls: "destinationPolls",
  /** groups/{groupId}/sharingItems/{itemId} 買い出し・分担 */
  sharingItems: "sharingItems",
} as const;

/** groups/{groupId}/config/{docId} の確定情報 */
export const SCHEDULE_CONFIG_DOC = "schedule";
