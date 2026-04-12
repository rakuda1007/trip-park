import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { CircleDoc, CircleMemberDoc } from "@/types/circle";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

export type CircleItem = { id: string; data: CircleDoc };
export type CircleMemberItem = { id: string; data: CircleMemberDoc };

/** ユーザーが作成したサークル一覧を取得 */
export async function listCircles(uid: string): Promise<CircleItem[]> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.circles);
  const snap = await getDocs(
    query(ref, where("ownerId", "==", uid), orderBy("createdAt", "asc")),
  );
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as CircleDoc }));
}

/** サークルを作成 */
export async function createCircle(
  uid: string,
  name: string,
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.circles);
  const docRef = await addDoc(ref, {
    name: name.trim(),
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** サークル名を更新 */
export async function updateCircle(
  circleId: string,
  name: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, COLLECTIONS.circles, circleId), {
    name: name.trim(),
    updatedAt: serverTimestamp(),
  });
}

/** サークルを削除（メンバーも一括削除） */
export async function deleteCircle(circleId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const membersRef = collection(
    db,
    COLLECTIONS.circles,
    circleId,
    SUB.members,
  );
  const snap = await getDocs(membersRef);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, COLLECTIONS.circles, circleId));
}

/** サークルのメンバー一覧を取得 */
export async function listCircleMembers(
  circleId: string,
): Promise<CircleMemberItem[]> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.circles, circleId, SUB.members);
  const snap = await getDocs(query(ref, orderBy("addedAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as CircleMemberDoc }));
}

/** サークルにメンバーを追加 */
export async function addCircleMember(
  circleId: string,
  params: { displayName: string; userId: string | null; note: string | null },
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.circles, circleId, SUB.members);
  const docRef = await addDoc(ref, {
    ...params,
    addedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** サークルメンバーを更新 */
export async function updateCircleMember(
  circleId: string,
  memberId: string,
  params: { displayName: string; userId: string | null; note: string | null },
): Promise<void> {
  const db = getFirebaseFirestore();
  await setDoc(
    doc(db, COLLECTIONS.circles, circleId, SUB.members, memberId),
    { ...params, addedAt: serverTimestamp() },
    { merge: true },
  );
}

/** サークルメンバーを削除 */
export async function deleteCircleMember(
  circleId: string,
  memberId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(db, COLLECTIONS.circles, circleId, SUB.members, memberId),
  );
}
