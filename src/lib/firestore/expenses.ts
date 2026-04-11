import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { ExpenseCategory, ExpenseDoc, ExpenseSplitMode } from "@/types/expense";
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

export async function listExpenses(groupId: string): Promise<
  { id: string; data: ExpenseDoc }[]
> {
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.expenses);
  const snap = await getDocs(query(col, orderBy("expenseDate", "desc")));
  const out: { id: string; data: ExpenseDoc }[] = [];
  snap.forEach((d) =>
    out.push({ id: d.id, data: d.data() as ExpenseDoc }),
  );
  return out;
}

export type FamilyRefsForExpense = { id: string; memberUserIds: string[] };

export type ExpenseInput = {
  amount: number;
  /** 立て替えた世帯のドキュメント ID */
  paidByFamilyId: string;
  expenseDate: string;
  category: ExpenseCategory;
  memo: string;
  splitMode: ExpenseSplitMode;
  participantUserIds: string[];
  /** splitMode が weighted のとき必須（uid -> 正の重み） */
  weightByUserId?: Record<string, number>;
};

function buildWeightByUserId(input: ExpenseInput): Record<string, number> {
  const participants = [...new Set(input.participantUserIds)];
  if (input.splitMode === "equal") {
    const o: Record<string, number> = {};
    for (const id of participants) o[id] = 1;
    return o;
  }
  const w = input.weightByUserId;
  if (!w || typeof w !== "object") {
    throw new Error("比率割の重みが不正です。");
  }
  const o: Record<string, number> = {};
  for (const id of participants) {
    const val = w[id];
    if (val == null || !Number.isFinite(val) || val <= 0) {
      throw new Error("負担する全員に正の重みを設定してください。");
    }
    o[id] = val;
  }
  return o;
}

function validateExpenseInput(
  input: ExpenseInput,
  memberIds: Set<string>,
  families: FamilyRefsForExpense[],
): void {
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("金額は 1 円以上の整数で入力してください。");
  }
  if (!input.paidByFamilyId?.trim()) {
    throw new Error("立て替えた世帯を選んでください。");
  }
  const payerFam = families.find((f) => f.id === input.paidByFamilyId);
  if (!payerFam) {
    throw new Error("立て替えた世帯が見つかりません。先に家族（世帯）を登録してください。");
  }
  const payerMembers = payerFam.memberUserIds.filter((id) => memberIds.has(id));
  if (payerMembers.length === 0) {
    throw new Error("立て替えた世帯にメンバーがいません。");
  }
  const parts = [...new Set(input.participantUserIds)].filter((id) =>
    memberIds.has(id),
  );
  if (parts.length === 0) {
    throw new Error("負担するメンバーを 1 人以上選んでください。");
  }
  if (!payerMembers.some((id) => parts.includes(id))) {
    throw new Error(
      "負担メンバーに、立て替えた世帯のメンバーを少なくとも1人含めてください。",
    );
  }
  if (input.splitMode === "weighted") {
    const w = input.weightByUserId;
    if (!w) throw new Error("比率割では重みを設定してください。");
    for (const id of parts) {
      const val = w[id];
      if (val == null || !Number.isFinite(val) || val <= 0) {
        throw new Error("負担する全員に正の重みを設定してください。");
      }
    }
  }
}

export async function addExpense(
  groupId: string,
  uid: string,
  memberIds: Set<string>,
  families: FamilyRefsForExpense[],
  input: ExpenseInput,
): Promise<string> {
  validateExpenseInput(input, memberIds, families);
  const amount = Math.floor(input.amount);
  const participants = [...new Set(input.participantUserIds)].filter((id) =>
    memberIds.has(id),
  );
  const weightByUserId = buildWeightByUserId({
    ...input,
    participantUserIds: participants,
  });
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.expenses);
  const ref = await addDoc(col, {
    amount,
    paidByFamilyId: input.paidByFamilyId,
    expenseDate: input.expenseDate,
    category: input.category,
    memo: input.memo.trim(),
    splitMode: input.splitMode,
    participantUserIds: participants,
    weightByUserId,
    createdByUserId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  memberIds: Set<string>,
  families: FamilyRefsForExpense[],
  input: ExpenseInput,
): Promise<void> {
  validateExpenseInput(input, memberIds, families);
  const amount = Math.floor(input.amount);
  const participants = [...new Set(input.participantUserIds)].filter((id) =>
    memberIds.has(id),
  );
  const weightByUserId = buildWeightByUserId({
    ...input,
    participantUserIds: participants,
  });
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.groups, groupId, SUB.expenses, expenseId);
  await updateDoc(ref, {
    amount,
    paidByFamilyId: input.paidByFamilyId,
    expenseDate: input.expenseDate,
    category: input.category,
    memo: input.memo.trim(),
    splitMode: input.splitMode,
    participantUserIds: participants,
    weightByUserId,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.expenses, expenseId),
  );
}
