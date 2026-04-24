import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { SharingItemDoc } from "@/types/sharing";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

export type SharingItemRow = {
  id: string;
  data: SharingItemDoc;
  /** 旧スキーマ（メンバー割当）のみ。世帯に切り替えるまで表示用 */
  legacyMemberAssignee?: { userId: string; displayName: string | null };
};

/** 世帯集計の1行（チェック用に id を保持） */
export type SharingSummaryEntry = {
  id: string;
  label: string;
  purchased: boolean;
};

/** 世帯ごとの担当集計（UI 用） */
export type SharingAssignmentByFamily = {
  familyId: string;
  familyName: string;
  itemEntries: SharingSummaryEntry[];
};

export async function listSharingItems(groupId: string): Promise<SharingItemRow[]> {
  const db = getFirebaseFirestore();
  const ref = collection(db, COLLECTIONS.groups, groupId, SUB.sharingItems);
  const snap = await getDocs(query(ref, orderBy("sortOrder", "asc")));
  const out: SharingItemRow[] = [];
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    const hasFamilyKey = "assignedFamilyId" in raw;
    const legacyUserId =
      typeof raw.assignedUserId === "string" && raw.assignedUserId
        ? raw.assignedUserId
        : null;
    const legacyDisplay =
      typeof raw.assignedDisplayName === "string"
        ? raw.assignedDisplayName
        : null;

    let assignedFamilyId: string | null = null;
    let assignedFamilyName: string | null = null;
    let legacyMemberAssignee:
      | { userId: string; displayName: string | null }
      | undefined;

    if (hasFamilyKey) {
      assignedFamilyId =
        typeof raw.assignedFamilyId === "string" ? raw.assignedFamilyId : null;
      assignedFamilyName =
        typeof raw.assignedFamilyName === "string"
          ? raw.assignedFamilyName
          : null;
    } else if (legacyUserId) {
      legacyMemberAssignee = {
        userId: legacyUserId,
        displayName: legacyDisplay,
      };
    }

    const row: SharingItemRow = {
      id: d.id,
      data: {
        label: typeof raw.label === "string" ? raw.label : "",
        memo: typeof raw.memo === "string" ? raw.memo : null,
        assignedFamilyId,
        assignedFamilyName,
        purchased: raw.purchased === true,
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
    };
    if (legacyMemberAssignee) {
      row.legacyMemberAssignee = legacyMemberAssignee;
    }
    out.push(row);
  });
  return out;
}

/** 世帯ごとに項目名をまとめる（集計表示用） */
export function aggregateSharingAssignmentsByFamily(
  items: SharingItemRow[],
  families: { id: string; data: { name: string } }[],
): {
  byFamily: SharingAssignmentByFamily[];
  unassignedEntries: SharingSummaryEntry[];
  legacyMemberRows: (SharingSummaryEntry & {
    displayName: string | null;
  })[];
} {
  const map = new Map<string, { name: string; entries: SharingSummaryEntry[] }>();
  const unassignedEntries: SharingSummaryEntry[] = [];
  const legacyMemberRows: (SharingSummaryEntry & {
    displayName: string | null;
  })[] = [];

  for (const row of items) {
    const { label, purchased } = row.data;
    const ent: SharingSummaryEntry = {
      id: row.id,
      label,
      purchased,
    };
    const fid = row.data.assignedFamilyId;
    if (fid) {
      const name =
        families.find((f) => f.id === fid)?.data.name ??
        row.data.assignedFamilyName?.trim() ??
        "世帯";
      let bucket = map.get(fid);
      if (!bucket) {
        bucket = { name, entries: [] };
        map.set(fid, bucket);
      }
      bucket.entries.push(ent);
    } else if (row.legacyMemberAssignee) {
      legacyMemberRows.push({
        ...ent,
        displayName: row.legacyMemberAssignee.displayName,
      });
    } else {
      unassignedEntries.push(ent);
    }
  }

  const familyIds = new Set(families.map((f) => f.id));
  const byFamily: SharingAssignmentByFamily[] = [];

  for (const f of families) {
    const b = map.get(f.id);
    if (b && b.entries.length > 0) {
      byFamily.push({
        familyId: f.id,
        familyName: f.data.name,
        itemEntries: b.entries,
      });
    }
  }
  for (const [fid, b] of map) {
    if (!familyIds.has(fid) && b.entries.length > 0) {
      byFamily.push({
        familyId: fid,
        familyName: b.name,
        itemEntries: b.entries,
      });
    }
  }

  return { byFamily, unassignedEntries, legacyMemberRows };
}

/** 要約用: 全件数と世帯未割当件数（旧メンバー割当は未割当に含める） */
export function sharingSummaryStats(items: SharingItemRow[]): {
  total: number;
  unassigned: number;
} {
  const total = items.length;
  const unassigned = items.filter((r) => !r.data.assignedFamilyId).length;
  return { total, unassigned };
}

/** 掲示板など用: 割当済み項目の短いプレビュー行（最大 max 件） */
export function sharingPreviewLines(
  items: SharingItemRow[],
  max = 3,
): string[] {
  const assigned = items.filter((r) => r.data.assignedFamilyId);
  return assigned.slice(0, max).map((r) => {
    const name = r.data.assignedFamilyName?.trim() || "世帯";
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
    assignedFamilyId: null,
    assignedFamilyName: null,
    purchased: false,
    sortOrder: nextOrder,
    createdByUserId: uid,
    createdByDisplayName: displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateSharingItemFamilyAssignment(
  groupId: string,
  itemId: string,
  assignedFamilyId: string | null,
  assignedFamilyName: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId);
  // createdByUserId 等はマージで維持する。再書き込みすると型が崩れたとき空文字になり
  // ルールの createdByUserId 一致で permission denied になるため、割当フィールドのみ更新する。
  await updateDoc(ref, {
    assignedFamilyId,
    assignedFamilyName,
    assignedUserId: deleteField(),
    assignedDisplayName: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSharingItemFields(
  groupId: string,
  itemId: string,
  params: { label: string; memo: string | null },
): Promise<void> {
  const db = getFirebaseFirestore();
  const label = params.label.trim();
  if (!label) throw new Error("項目名を入力してください。");
  const ref = doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("項目が見つかりません。");
  const raw = snap.data() as Record<string, unknown>;
  const memo = params.memo?.trim() || null;

  if ("assignedFamilyId" in raw) {
    await updateDoc(ref, {
      label,
      memo,
      assignedFamilyId:
        typeof raw.assignedFamilyId === "string"
          ? raw.assignedFamilyId
          : null,
      assignedFamilyName:
        typeof raw.assignedFamilyName === "string"
          ? raw.assignedFamilyName
          : null,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    label,
    memo,
    updatedAt: serverTimestamp(),
  });
}

export async function updateSharingItemPurchased(
  groupId: string,
  itemId: string,
  purchased: boolean,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId),
    {
      purchased,
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

/** 表示順（上から）に itemId を並べ、sortOrder を 0..n-1 で保存 */
export async function reorderSharingItemsOrder(
  groupId: string,
  orderedItemIds: string[],
): Promise<void> {
  const db = getFirebaseFirestore();
  await Promise.all(
    orderedItemIds.map((itemId, index) =>
      updateDoc(
        doc(db, COLLECTIONS.groups, groupId, SUB.sharingItems, itemId),
        {
          sortOrder: index,
          updatedAt: serverTimestamp(),
        },
      ),
    ),
  );
}
