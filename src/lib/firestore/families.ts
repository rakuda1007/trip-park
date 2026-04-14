import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { FamilyDoc } from "@/types/family";
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

export async function listFamilies(groupId: string): Promise<
  { id: string; data: FamilyDoc }[]
> {
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.families);
  const snap = await getDocs(query(col, orderBy("name", "asc")));
  const out: { id: string; data: FamilyDoc }[] = [];
  snap.forEach((d) => out.push({ id: d.id, data: d.data() as FamilyDoc }));
  return out;
}

export type FamilyInput = {
  name: string;
  adultCount: number;
  childCount: number;
  /**
   * メンバーが2人以上のとき必須（大人1を1とした子供の重み、0より大きく1以下）。
   * 一人世帯では未使用（保存時は 1）。
   */
  childRatio: number;
  memberUserIds: string[];
  /** 世帯マスタからコピーした場合の参照 ID。手動入力なら null */
  householdMasterId: string | null;
};

function validateFamilyInput(input: FamilyInput): void {
  const name = input.name.trim();
  if (!name) throw new Error("世帯名を入力してください。");
  const a = Math.floor(input.adultCount);
  const c = Math.floor(input.childCount);
  if (!Number.isFinite(a) || a < 0) throw new Error("大人の人数が不正です。");
  if (!Number.isFinite(c) || c < 0) throw new Error("子供の人数が不正です。");
  if (a + c < 1) throw new Error("大人または子供の人数を 1 以上にしてください。");
  // 子供がいる場合は childRatio を検証
  if (c > 0) {
    const cr = Number(input.childRatio);
    if (!Number.isFinite(cr) || cr <= 0 || cr > 1) {
      throw new Error(
        "子供の負担比率は 0.1〜1.0 の範囲で入力してください。",
      );
    }
  }
}

/** 同一メンバーが複数世帯に入らないよう検証 */
export function assertNoMemberOverlap(
  families: { id: string; data: FamilyDoc }[],
  memberUserIds: string[],
  excludeFamilyId?: string,
): void {
  const set = new Set(memberUserIds);
  for (const f of families) {
    if (excludeFamilyId && f.id === excludeFamilyId) continue;
    for (const uid of f.data.memberUserIds) {
      if (set.has(uid)) {
        throw new Error(
          "選んだメンバーのうち、すでに別の世帯に登録されている人がいます。世帯は重複できません。",
        );
      }
    }
  }
}

export async function addFamily(
  groupId: string,
  uid: string,
  memberIds: Set<string>,
  input: FamilyInput,
): Promise<string> {
  validateFamilyInput(input);
  const existing = await listFamilies(groupId);
  const ids = [...new Set(input.memberUserIds)].filter((id) => memberIds.has(id));
  assertNoMemberOverlap(existing, ids);
  const ratioStored = Math.floor(input.childCount) > 0 ? Number(input.childRatio) : 1.0;
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.families);
  const ref = await addDoc(col, {
    name: input.name.trim(),
    adultCount: Math.floor(input.adultCount),
    childCount: Math.floor(input.childCount),
    childRatio: ratioStored,
    memberUserIds: ids,
    householdMasterId: input.householdMasterId ?? null,
    createdByUserId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateFamily(
  groupId: string,
  familyId: string,
  memberIds: Set<string>,
  input: FamilyInput,
): Promise<void> {
  validateFamilyInput(input);
  const existing = await listFamilies(groupId);
  const ids = [...new Set(input.memberUserIds)].filter((id) => memberIds.has(id));
  assertNoMemberOverlap(existing, ids, familyId);
  const ratioStored = Math.floor(input.childCount) > 0 ? Number(input.childRatio) : 1.0;
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.groups, groupId, SUB.families, familyId);
  await updateDoc(ref, {
    name: input.name.trim(),
    adultCount: Math.floor(input.adultCount),
    childCount: Math.floor(input.childCount),
    childRatio: ratioStored,
    memberUserIds: ids,
    householdMasterId: input.householdMasterId ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFamily(
  groupId: string,
  familyId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.families, familyId),
  );
}
