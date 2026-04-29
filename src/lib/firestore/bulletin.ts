import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import {
  normalizeBulletinTopicTags,
  type BulletinCategory,
  type BulletinImportance,
  type BulletinRecipeVoteDoc,
  type BulletinReplyDoc,
  type BulletinTopicDoc,
  type BulletinTopicReplyReadProgressDoc,
  type BulletinTopicTag,
  type NearbyMapSpot,
  type RecipePollData,
  type RecipePollResolution,
} from "@/types/bulletin";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

function bulletinTopicCreatedAtMs(data: BulletinTopicDoc): number {
  const v = data.createdAt;
  if (v instanceof Timestamp) return v.toMillis();
  return 0;
}

/** 一覧表示順: 上位表示タグ → ピン留め → それ以外。同一帯域内は新しい順 */
function compareBulletinTopicsForList(
  a: { data: BulletinTopicDoc },
  b: { data: BulletinTopicDoc },
): number {
  const aTop = normalizeBulletinTopicTags(a.data).includes("priority_top");
  const bTop = normalizeBulletinTopicTags(b.data).includes("priority_top");
  if (aTop !== bTop) return aTop ? -1 : 1;
  if (a.data.pinned !== b.data.pinned) return a.data.pinned ? -1 : 1;
  const ma = bulletinTopicCreatedAtMs(a.data);
  const mb = bulletinTopicCreatedAtMs(b.data);
  return mb - ma;
}

export async function listBulletinTopics(groupId: string): Promise<
  { id: string; data: BulletinTopicDoc }[]
> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
  );
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
  const out: { id: string; data: BulletinTopicDoc }[] = [];
  snap.forEach((d) =>
    out.push({ id: d.id, data: d.data() as BulletinTopicDoc }),
  );
  out.sort(compareBulletinTopicsForList);
  return out;
}

/** @deprecated listBulletinTopics を使用してください */
export const listBulletinPosts = listBulletinTopics;

/** 一覧用: 各話題の返信数（集計クエリ） */
export async function listBulletinTopicsWithReplyCounts(groupId: string): Promise<
  { id: string; data: BulletinTopicDoc; replyCount: number }[]
> {
  const topics = await listBulletinTopics(groupId);
  const db = getFirebaseFirestore();
  return Promise.all(
    topics.map(async (t) => {
      const repliesCol = collection(
        db,
        COLLECTIONS.groups,
        groupId,
        SUB.bulletinPosts,
        t.id,
        SUB.replies,
      );
      const countSnap = await getCountFromServer(query(repliesCol));
      return {
        ...t,
        replyCount: countSnap.data().count,
      };
    }),
  );
}

export async function getBulletinTopic(
  groupId: string,
  topicId: string,
): Promise<BulletinTopicDoc | null> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as BulletinTopicDoc;
}

export async function listBulletinReplies(
  groupId: string,
  topicId: string,
): Promise<{ id: string; data: BulletinReplyDoc }[]> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.replies,
  );
  const snap = await getDocs(query(col, orderBy("createdAt", "asc")));
  const out: { id: string; data: BulletinReplyDoc }[] = [];
  snap.forEach((d) =>
    out.push({ id: d.id, data: d.data() as BulletinReplyDoc }),
  );
  return out;
}

export async function createBulletinTopic(
  groupId: string,
  authorUid: string,
  authorDisplayName: string | null,
  title: string,
  body: string,
  category: BulletinCategory,
  importance: BulletinImportance,
  recipePoll?: RecipePollData | null,
  nearbyMapSpots?: NearbyMapSpot[] | null,
  tags?: BulletinTopicTag[],
): Promise<string> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
  );
  const payload: Record<string, unknown> = {
    title: title.trim(),
    body: body.trim(),
    authorUserId: authorUid,
    authorDisplayName: authorDisplayName ?? null,
    category,
    importance,
    pinned: false,
    tags: tags?.length ? tags : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (category === "recipe_vote" && recipePoll?.candidates?.length) {
    payload.recipePoll = recipePoll;
  }
  if (category === "nearby_map" && nearbyMapSpots?.length) {
    payload.nearbyMapSpots = nearbyMapSpots;
  }
  const ref = await addDoc(col, payload);
  return ref.id;
}

/** @deprecated createBulletinTopic を使用してください */
export const createBulletinPost = createBulletinTopic;

export async function updateBulletinTopic(
  groupId: string,
  topicId: string,
  title: string,
  body: string,
  category: BulletinCategory,
  importance: BulletinImportance,
  recipePoll?: RecipePollData | null,
  nearbyMapSpots?: NearbyMapSpot[] | null,
  tags?: BulletinTopicTag[],
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
  );
  const updates: Record<string, unknown> = {
    title: title.trim(),
    body: body.trim(),
    category,
    importance,
    tags: tags?.length ? tags : [],
    updatedAt: serverTimestamp(),
  };
  if (category === "recipe_vote" && recipePoll?.candidates?.length) {
    updates.recipePoll = recipePoll;
  } else {
    updates.recipePoll = deleteField();
    updates.recipePollResolution = deleteField();
  }
  if (category === "nearby_map" && nearbyMapSpots?.length) {
    updates.nearbyMapSpots = nearbyMapSpots;
  } else {
    updates.nearbyMapSpots = deleteField();
  }
  await updateDoc(ref, updates);
}

export async function updateRecipePollResolution(
  groupId: string,
  topicId: string,
  resolution: RecipePollResolution | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
  );
  if (resolution === null) {
    await updateDoc(ref, {
      recipePollResolution: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      recipePollResolution: resolution,
      updatedAt: serverTimestamp(),
    });
  }
}

export const updateBulletinPost = updateBulletinTopic;

export async function setBulletinTopicPinned(
  groupId: string,
  topicId: string,
  pinned: boolean,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
  );
  await updateDoc(ref, {
    pinned,
    updatedAt: serverTimestamp(),
  });
}

export const setBulletinPostPinned = setBulletinTopicPinned;

/** 返信をすべて削除してから話題を削除 */
export async function deleteBulletinTopic(
  groupId: string,
  topicId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const repliesCol = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.replies,
  );
  const repliesSnap = await getDocs(repliesCol);
  await Promise.all(repliesSnap.docs.map((d) => deleteDoc(d.ref)));

  const votesCol = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.recipeVotes,
  );
  const votesSnap = await getDocs(votesCol);
  await Promise.all(votesSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.bulletinPosts, topicId),
  );
}

export async function listRecipeVotes(
  groupId: string,
  topicId: string,
): Promise<{ userId: string; data: BulletinRecipeVoteDoc }[]> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.recipeVotes,
  );
  const snap = await getDocs(col);
  const out: { userId: string; data: BulletinRecipeVoteDoc }[] = [];
  snap.forEach((d) =>
    out.push({
      userId: d.id,
      data: d.data() as BulletinRecipeVoteDoc,
    }),
  );
  return out;
}

export async function setMyRecipeRatings(
  groupId: string,
  topicId: string,
  userId: string,
  ratings: number[],
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.recipeVotes,
    userId,
  );
  await setDoc(ref, {
    ratings,
    updatedAt: serverTimestamp(),
  });
}

/** 候補やカテゴリ変更時に投票をリセット */
export async function clearAllRecipeVotes(
  groupId: string,
  topicId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.recipeVotes,
  );
  const snap = await getDocs(col);
  const bs = writeBatch(db);
  for (const d of snap.docs) {
    bs.delete(d.ref);
  }
  await bs.commit();
}

export const deleteBulletinPost = deleteBulletinTopic;

export async function createBulletinReply(
  groupId: string,
  topicId: string,
  authorUid: string,
  authorDisplayName: string | null,
  body: string,
): Promise<string> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.replies,
  );
  const ref = await addDoc(col, {
    body: body.trim(),
    authorUserId: authorUid,
    authorDisplayName: authorDisplayName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBulletinReply(
  groupId: string,
  topicId: string,
  replyId: string,
  body: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.replies,
    replyId,
  );
  await updateDoc(ref, {
    body: body.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBulletinReply(
  groupId: string,
  topicId: string,
  replyId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(
      db,
      COLLECTIONS.groups,
      groupId,
      SUB.bulletinPosts,
      topicId,
      SUB.replies,
      replyId,
    ),
  );
}

/** 返信 ID 順（時系列）に対する「その返信まで読んだ人数」 */
export function computeReplyReadCounts(
  replyIdsOrdered: string[],
  reads: { userId: string; lastReadReplyId: string | null }[],
): number[] {
  const idToIndex = new Map(replyIdsOrdered.map((id, i) => [id, i]));
  const counts = new Array(replyIdsOrdered.length).fill(0);
  for (const r of reads) {
    if (r.lastReadReplyId == null) continue;
    const j = idToIndex.get(r.lastReadReplyId);
    if (j === undefined) continue;
    for (let i = 0; i <= j; i++) {
      counts[i]++;
    }
  }
  return counts;
}

export async function listTopicReplyReadProgress(
  groupId: string,
  topicId: string,
): Promise<{ userId: string; lastReadReplyId: string | null }[]> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.replyReadProgress,
  );
  const snap = await getDocs(col);
  const out: { userId: string; lastReadReplyId: string | null }[] = [];
  snap.forEach((d) => {
    const data = d.data() as BulletinTopicReplyReadProgressDoc;
    out.push({
      userId: d.id,
      lastReadReplyId: data.lastReadReplyId ?? null,
    });
  });
  return out;
}

/** 自分が「この返信まで読んだ」と記録（時系列で最後の返信 ID を渡す） */
export async function setMyTopicReplyReadProgress(
  groupId: string,
  topicId: string,
  readerUid: string,
  lastReadReplyId: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
    topicId,
    SUB.replyReadProgress,
    readerUid,
  );
  await setDoc(ref, {
    lastReadReplyId,
    updatedAt: serverTimestamp(),
  });
}
