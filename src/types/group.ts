export type GroupRole = "owner" | "admin" | "member";

export type GroupDoc = {
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type MemberDoc = {
  role: GroupRole;
  joinedAt: unknown;
  displayName: string | null;
};

/** 参加時の検証用。保存後に deleteField で削除する */
export type MemberDocWithJoinCode = MemberDoc & { code: string };

export type UserGroupRefDoc = {
  groupId: string;
  groupName: string;
  role: GroupRole;
  joinedAt: unknown;
};

export type InviteCodeDoc = {
  groupId: string;
  groupName: string;
  createdAt: unknown;
};
