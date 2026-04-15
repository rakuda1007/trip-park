import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { SharingItemDoc } from "@/types/sharing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

export type SharingItemRow = { id: string; data: SharingItemDoc };

export async function listSharingItems(groupId: string): Promise<SharingItemRow[]> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.groups, groupId, SUB.sharingItems);
  const snap = await getDocs(query(ref, orderBy("sortOrder", "asc")));
  const out: SharingItemRow[] = [];
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    out.push({
      id: d.id,
      data: {
        label: typeof raw.label === "string" ? raw.label : "",
        memo: typeof raw.memo === "string" ? raw.memo : null,
        assignedUserId:
          typeof raw.assignedUserId === "string" ? raw.assignedUserId : null,
        assignedDisplayName:
          typeof raw.assignedDisplayName === "string"
            ? raw.assignedDisplayName
            : null,
        sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
        createdByUserId:
          typeof raw.createdByUserId === "string" ? raw.createdByUserId : "",
        createdByDisplayName:
          typeof raw.createdByDisplayName === "string"
            ? raw.createdByDisplayName
            : null,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
    });
  });
  return out;
}

/** 要約用: 全件数と未割当件数 */
export function sharingSummaryStats(items: SharingItemRow[]): {
  total: number;
  unassigned: number;
} {
  const total = items.length;
  const unassigned = items.filter((r) => !r.data.assignedUserId).length;
  return { total, unassigned };
}

/** 掲示板など用: 割当済み項目の短いプレビュー行（最大 max 件） */
export function sharingPreviewLines(
  items: SharingItemRow[],
  max = 3,
): string[] {
  const assigned = items.filter((r) => r.data.assignedUserId);
  return assigned.slice(0, max).map((r) => {
    const name = r.data.assignedDisplayName?.trim() || "メンバー";
    return `${r.data.label} → ${name}`;
  });
}

export async function addSharingItem(
  groupId: string,
  uid: string,
  displayName: string | null,
  params: { label: string; memo: string | null },
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.groups, groupId, SUB.sharingItems);
  const label = params.label.trim();
  if (!label) throw new Error("項目名を入力してください。");
  const topSnap = await getDocs(
    query(ref, orderBy("sortOrder", "desc"), limit(1)),
  );
  let nextOrder = 0;
  if (!topSnap.empty) {
    const so = (topSnap.docs[0]!.data() as { sortOrder?: number }).sortOrder;
    nextOrder = (typeof so === "number" ? so : 0) + 1;
  }
  const docRef = await addDoc(ref, {
    label,
    memo: params.memo?.trim() || null,
    assignedUserId: null,
    assignedDisplayName: null,
    sortOrder: nextOrder,
    createdByUserId: uid,
    createdByDisplayName: displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateSharingItemAssignment(
  groupId: string,
  itemId: string,
  assignedUserId: string | null,
  assignedDisplayName: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId),
    {
      assignedUserId,
      assignedDisplayName,
      updatedAt: serverTimestamp(),
    },
  );
}

export async function updateSharingItemFields(
  groupId: string,
  itemId: string,
  params: { label: string; memo: string | null },
): Promise<void> {
  const db = getFirebaseFirestore();
  const label = params.label.trim();
  if (!label) throw new Error("項目名を入力してください。");
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId),
    {
      label,
      memo: params.memo?.trim() || null,
      updatedAt: serverTimestamp(),
    },
  );
}

export async function deleteSharingItem(
  groupId: string,
  itemId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId),
  );
}
