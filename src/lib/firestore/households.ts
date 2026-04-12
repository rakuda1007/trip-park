import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { HouseholdDoc } from "@/types/household";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

export type HouseholdItem = { id: string; data: HouseholdDoc };

/** ユーザーの世帯マスタ一覧を取得 */
export async function listHouseholds(uid: string): Promise<HouseholdItem[]> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.users, uid, SUB.households);
  const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as HouseholdDoc }));
}

/** 世帯マスタを新規作成 */
export async function createHousehold(
  uid: string,
  params: {
    name: string;
    defaultAdultCount: number;
    defaultChildCount: number;
    defaultChildRatio: number;
    memberUserIds: string[];
  },
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.users, uid, SUB.households);
  const docRef = await addDoc(ref, {
    ...params,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** 世帯マスタを更新 */
export async function updateHousehold(
  uid: string,
  householdId: string,
  params: {
    name: string;
    defaultAdultCount: number;
    defaultChildCount: number;
    defaultChildRatio: number;
    memberUserIds: string[];
  },
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.users, uid, SUB.households, householdId);
  await updateDoc(ref, {
    ...params,
    updatedAt: serverTimestamp(),
  });
}

/** 世帯マスタを削除 */
export async function deleteHousehold(
  uid: string,
  householdId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.users, uid, SUB.households, householdId);
  await deleteDoc(ref);
}
