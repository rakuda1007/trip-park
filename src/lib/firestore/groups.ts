import { getFirebaseFirestore } from "@/lib/firebase/client";
import {
  COLLECTIONS,
  SCHEDULE_CONFIG_DOC,
  SUB,
} from "@/lib/firestore/collections";
import type { GroupDoc, InviteCodeDoc, MemberDoc, TripStatus, UserGroupRefDoc } from "@/types/group";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]!;
  }
  return code;
}

async function ensureUniqueInviteCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateInviteCode();
    const ref = doc(db, COLLECTIONS.inviteCodes, code);
    const snap = await getDoc(ref);
    if (!snap.exists()) return code;
  }
  throw new Error("招待コードの生成に失敗しました。もう一度お試しください。");
}

export async function createGroup(
  uid: string,
  displayName: string | null,
  name: string,
  description: string | null,
  tripStartDate?: string | null,
  tripEndDate?: string | null,
): Promise<string> {
  const db = getFirebaseFirestore();
  const code = await ensureUniqueInviteCode(db);
  const groupRef = doc(collection(db, COLLECTIONS.groups));
  const groupId = groupRef.id;
  const inviteRef = doc(db, COLLECTIONS.inviteCodes, code);
  const memberRef = doc(db, COLLECTIONS.groups, groupId, SUB.members, uid);

  // セキュリティルールの exists/get が同一バッチ内の未コミット書き込みを参照できないため、
  // 先に groups のみ作成してから inviteCodes / members を書く。
  await setDoc(groupRef, {
    name,
    description: description ?? null,
    ownerId: uid,
    inviteCode: code,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    tripStartDate: tripStartDate ?? null,
    tripEndDate: tripEndDate ?? null,
    destination: null,
    status: "planning",
  });

  const batch = writeBatch(db);
  batch.set(inviteRef, {
    groupId,
    groupName: name,
    createdAt: serverTimestamp(),
  });
  batch.set(memberRef, {
    role: "owner",
    joinedAt: serverTimestamp(),
    displayName: displayName ?? null,
  });
  await batch.commit();

  const userGroupRef = doc(db, COLLECTIONS.users, uid, SUB.groups, groupId);
  await setDoc(userGroupRef, {
    groupId,
    groupName: name,
    role: "owner" as const,
    joinedAt: serverTimestamp(),
  });

  return groupId;
}

export async function joinGroupWithCode(
  uid: string,
  displayName: string | null,
  rawCode: string,
): Promise<string> {
  const db = getFirebaseFirestore();
  const code = rawCode.trim().toUpperCase();
  if (code.length < 4) {
    throw new Error("招待コードを入力してください。");
  }

  const inviteRef = doc(db, COLLECTIONS.inviteCodes, code);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) {
    throw new Error("招待コードが見つかりません。");
  }

  const { groupId, groupName: nameFromInvite } = inviteSnap.data() as InviteCodeDoc;
  const memberRef = doc(db, COLLECTIONS.groups, groupId, SUB.members, uid);

  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    throw new Error("すでにこのグループに参加しています。");
  }

  const groupName = nameFromInvite || "グループ";

  const batch = writeBatch(db);
  batch.set(memberRef, {
    role: "member",
    joinedAt: serverTimestamp(),
    displayName: displayName ?? null,
    code,
  });
  await batch.commit();

  const userGroupRef = doc(db, COLLECTIONS.users, uid, SUB.groups, groupId);
  await setDoc(userGroupRef, {
    groupId,
    groupName,
    role: "member" as const,
    joinedAt: serverTimestamp(),
  });

  await updateDoc(memberRef, {
    code: deleteField(),
  });

  return groupId;
}

export async function listMyGroups(uid: string): Promise<
  { groupId: string; data: UserGroupRefDoc }[]
> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.users, uid, SUB.groups);
  const q = query(ref, orderBy("joinedAt", "desc"));
  const snap = await getDocs(q);
  const items: { groupId: string; data: UserGroupRefDoc }[] = [];
  snap.forEach((d) => {
    items.push({ groupId: d.id, data: d.data() as UserGroupRefDoc });
  });

  // グループ本体から旅行日程を並列取得
  // 権限エラーや削除済みグループは null として扱いリストから除外する
  const groupSnaps = await Promise.all(
    items.map(({ groupId }) =>
      getDoc(doc(db, COLLECTIONS.groups, groupId)).catch(() => null),
    ),
  );

  return items.flatMap((item, i) => {
    const gSnap = groupSnaps[i];
    if (!gSnap) return []; // アクセス不可 → スキップ
    const gd = gSnap.data() as GroupDoc | undefined;
    return [
      {
        groupId: item.groupId,
        data: {
          ...item.data,
          tripStartDate: gd?.tripStartDate ?? null,
          tripEndDate: gd?.tripEndDate ?? null,
        },
      },
    ];
  });
}

/** グループの旅行日程を更新する（オーナーまたは管理者が実行） */
export async function updateGroupTripDates(
  groupId: string,
  startDate: string | null,
  endDate: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, COLLECTIONS.groups, groupId), {
    tripStartDate: startDate,
    tripEndDate: endDate,
    updatedAt: serverTimestamp(),
  });
}

export async function getGroup(groupId: string): Promise<GroupDoc | null> {
  const db = getFirebaseFirestore();
  const snap = await getDoc(doc(db, COLLECTIONS.groups, groupId));
  if (!snap.exists()) return null;
  return snap.data() as GroupDoc;
}

export async function listMembers(groupId: string): Promise<
  { userId: string; data: MemberDoc }[]
> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.groups, groupId, SUB.members);
  const snap = await getDocs(query(ref, orderBy("joinedAt", "asc")));
  const out: { userId: string; data: MemberDoc }[] = [];
  snap.forEach((d) => {
    const raw = d.data() as MemberDoc & { code?: string };
    const { code: _c, ...rest } = raw;
    void _c;
    out.push({ userId: d.id, data: rest });
  });
  return out;
}

export async function leaveGroup(uid: string, groupId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const group = await getGroup(groupId);
  if (!group) throw new Error("グループが見つかりません。");
  if (group.ownerId === uid) {
    throw new Error(
      "オーナーはグループを抜けられません。グループを削除するか、別のオーナーに移譲する機能は今後追加予定です。",
    );
  }

  const memberRef = doc(db, COLLECTIONS.groups, groupId, SUB.members, uid);
  const userGroupRef = doc(db, COLLECTIONS.users, uid, SUB.groups, groupId);
  await deleteDoc(memberRef);
  await deleteDoc(userGroupRef);
}

export async function removeMember(
  actorUid: string,
  groupId: string,
  targetUid: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const group = await getGroup(groupId);
  if (!group) throw new Error("グループが見つかりません。");
  if (group.ownerId !== actorUid) {
    throw new Error("メンバーを外す権限がありません。");
  }
  if (targetUid === group.ownerId) {
    throw new Error("オーナーを外すことはできません。");
  }

  const memberRef = doc(db, COLLECTIONS.groups, groupId, SUB.members, targetUid);
  const userGroupRef = doc(
    db,
    COLLECTIONS.users,
    targetUid,
    SUB.groups,
    groupId,
  );
  await deleteDoc(memberRef);
  await deleteDoc(userGroupRef);
}

async function deleteGroupSubcollection(
  db: Firestore,
  groupId: string,
  subName: string,
) {
  const col = collection(db, COLLECTIONS.groups, groupId, subName);
  const snap = await getDocs(col);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/** 掲示板: 各話題の返信を消してから話題を消す */
async function deleteBulletinPostsTree(db: Firestore, groupId: string) {
  const topicsSnap = await getDocs(
    collection(db, COLLECTIONS.groups, groupId, SUB.bulletinPosts),
  );
  for (const d of topicsSnap.docs) {
    const repliesSnap = await getDocs(
      collection(
        db,
        COLLECTIONS.groups,
        groupId,
        SUB.bulletinPosts,
        d.id,
        SUB.replies,
      ),
    );
    await Promise.all(repliesSnap.docs.map((r) => deleteDoc(r.ref)));
    await deleteDoc(d.ref);
  }
}

export async function deleteGroup(ownerUid: string, groupId: string): Promise<void> {
  const db = getFirebaseFirestore();

  // [手順1] グループ本体を読み取り（isGroupMember チェック）
  let group: GroupDoc | null;
  try {
    group = await getGroup(groupId);
  } catch (e) {
    throw new Error(`[手順1:グループ読み取り] ${e instanceof Error ? e.message : e}`);
  }
  if (!group) throw new Error("旅行が見つかりません。");
  if (group.ownerId !== ownerUid) throw new Error("旅行を削除できるのはオーナーのみです。");

  // [手順2] メンバー一覧を読み取り
  let membersSnap: Awaited<ReturnType<typeof getDocs>>;
  try {
    membersSnap = await getDocs(
      collection(db, COLLECTIONS.groups, groupId, SUB.members),
    );
  } catch (e) {
    throw new Error(`[手順2:メンバー読み取り] ${e instanceof Error ? e.message : e}`);
  }

  // [手順3] サブコレクション削除（エラーは無視して続行）
  const cleanups = [
    SUB.scheduleCandidates,
    SUB.scheduleResponses,
    SUB.tripRoutes,
    SUB.expenses,
    SUB.families,
    SUB.destinationCandidates,
    SUB.destinationVotes,
  ];
  for (const sub of cleanups) {
    await deleteGroupSubcollection(db, groupId, sub).catch(() => {});
  }
  await deleteBulletinPostsTree(db, groupId).catch(() => {});
  const scheduleCfgRef = doc(db, COLLECTIONS.groups, groupId, SUB.config, SCHEDULE_CONFIG_DOC);
  await getDoc(scheduleCfgRef)
    .then((snap) => (snap.exists() ? deleteDoc(scheduleCfgRef) : undefined))
    .catch(() => {});

  // [手順4] メンバードキュメントを個別に削除（グループ文書はまだ存在する状態）
  try {
    await Promise.all(membersSnap.docs.map((m) => deleteDoc(m.ref)));
  } catch (e) {
    throw new Error(`[手順4:メンバー削除] ${e instanceof Error ? e.message : e}`);
  }

  // [手順5] 招待コードを削除（グループ文書はまだ存在する状態）
  try {
    await deleteDoc(doc(db, COLLECTIONS.inviteCodes, group.inviteCode));
  } catch (e) {
    throw new Error(`[手順5:招待コード削除] ${e instanceof Error ? e.message : e}`);
  }

  // [手順6] グループ文書を削除
  try {
    await deleteDoc(doc(db, COLLECTIONS.groups, groupId));
  } catch (e) {
    throw new Error(`[手順6:グループ削除] ${e instanceof Error ? e.message : e}`);
  }

  // [手順7] 各メンバーの UserGroupRef を削除（他メンバーのはエラーを無視）
  try {
    await Promise.all(
      membersSnap.docs.map((m) => {
        const ug = doc(db, COLLECTIONS.users, m.id, SUB.groups, groupId);
        const p = deleteDoc(ug);
        return m.id === ownerUid ? p : p.catch(() => {});
      }),
    );
  } catch (e) {
    throw new Error(`[手順7:UserGroupRef削除] ${e instanceof Error ? e.message : e}`);
  }
}

export function buildJoinUrl(code: string): string {
  if (typeof window === "undefined") {
    return `/join?code=${encodeURIComponent(code)}`;
  }
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

/**
 * 未ユーザー向け招待ランディングURL（/welcome?code=...）
 * ログイン済みユーザーは /join へリダイレクトされる
 */
export function buildWelcomeUrl(code: string): string {
  if (typeof window === "undefined") {
    return `/welcome?code=${encodeURIComponent(code)}`;
  }
  return `${window.location.origin}/welcome?code=${encodeURIComponent(code)}`;
}

/** 招待コードの情報を未ログイン状態でも取得（招待ランディングページ用） */
export async function getInviteCodeInfo(
  code: string,
): Promise<InviteCodeDoc | null> {
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.inviteCodes, code.trim().toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as InviteCodeDoc;
}

/** 旅行フェーズを更新する（オーナーのみ） */
export async function updateTripStatus(
  groupId: string,
  status: TripStatus,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, COLLECTIONS.groups, groupId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** 目的地を更新する（オーナー / 管理者） */
export async function updateDestination(
  groupId: string,
  destination: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, COLLECTIONS.groups, groupId), {
    destination,
    updatedAt: serverTimestamp(),
  });
}
