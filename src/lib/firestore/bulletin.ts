import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type {
  BulletinCategory,
  BulletinImportance,
  BulletinReplyDoc,
  BulletinTopicDoc,
} from "@/types/bulletin";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

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
  out.sort((a, b) => {
    if (a.data.pinned !== b.data.pinned) return a.data.pinned ? -1 : 1;
    return 0;
  });
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
): Promise<string> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.bulletinPosts,
  );
  const ref = await addDoc(col, {
    title: title.trim(),
    body: body.trim(),
    authorUserId: authorUid,
    authorDisplayName: authorDisplayName ?? null,
    category,
    importance,
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
    title: title.trim(),
    body: body.trim(),
    category,
    importance,
    updatedAt: serverTimestamp(),
  });
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
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.bulletinPosts, topicId),
  );
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
