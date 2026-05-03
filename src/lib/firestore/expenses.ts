import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type {
  ExpenseCategory,
  ExpenseDoc,
  ExpenseSplitMode,
  PerExpenseFamilyDemographics,
} from "@/types/expense";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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

export type ExpenseInput = {
  amount: number;
  /** 立て替えた世帯の ID */
  paidByFamilyId: string;
  expenseDate: string;
  category: ExpenseCategory;
  memo: string;
  splitMode: ExpenseSplitMode;
  /** 負担の対象となる世帯 ID リスト（paidByFamilyId を含むこと） */
  participantFamilyIds: string[];
  /** 人数割のとき: familyId -> 重み（adultCount + childCount * childRatio） */
  weightByFamilyId?: Record<string, number>;
  /** 人数割でこの支出だけ人数を上書きした場合、世帯ごとの入力（未設定なら保存しない） */
  perExpenseFamilyDemographicsByFamilyId?: Record<
    string,
    PerExpenseFamilyDemographics
  >;
};

function buildWeightByFamilyId(input: ExpenseInput): Record<string, number> {
  const parts = [...new Set(input.participantFamilyIds)];
  const o: Record<string, number> = {};
  if (input.splitMode === "equal") {
    for (const id of parts) o[id] = 1;
    return o;
  }
  const w = input.weightByFamilyId;
  if (!w || typeof w !== "object") {
    throw new Error("人数割の重みが設定されていません。");
  }
  for (const id of parts) {
    const val = w[id];
    if (val == null || !Number.isFinite(val) || val <= 0) {
      throw new Error("負担する全ての世帯に正の重みを設定してください。");
    }
    o[id] = val;
  }
  return o;
}

function validateExpenseInput(
  input: ExpenseInput,
  families: { id: string }[],
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
    throw new Error("立て替えた世帯が見つかりません。先に世帯を登録してください。");
  }
  const parts = [...new Set(input.participantFamilyIds)].filter((id) =>
    families.some((f) => f.id === id),
  );
  if (parts.length === 0) {
    throw new Error("負担の対象となる世帯を 1 つ以上選んでください。");
  }
  if (!parts.includes(input.paidByFamilyId)) {
    throw new Error("立て替えた世帯を「負担の対象」に含めてください。");
  }
}

export async function addExpense(
  groupId: string,
  uid: string,
  families: { id: string }[],
  input: ExpenseInput,
): Promise<string> {
  validateExpenseInput(input, families);
  const amount = Math.floor(input.amount);
  const parts = [...new Set(input.participantFamilyIds)].filter((id) =>
    families.some((f) => f.id === id),
  );
  const weightByFamilyId = buildWeightByFamilyId({
    ...input,
    participantFamilyIds: parts,
  });
  const demo = input.perExpenseFamilyDemographicsByFamilyId;
  const demoClean =
    demo &&
    typeof demo === "object" &&
    Object.keys(demo).length > 0 &&
    input.splitMode === "weighted"
      ? demo
      : undefined;

  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.expenses);
  const ref = await addDoc(col, {
    amount,
    paidByFamilyId: input.paidByFamilyId,
    expenseDate: input.expenseDate,
    category: input.category,
    memo: input.memo.trim(),
    splitMode: input.splitMode,
    participantFamilyIds: parts,
    weightByFamilyId,
    ...(demoClean ? { perExpenseFamilyDemographicsByFamilyId: demoClean } : {}),
    participantUserIds: [],
    createdByUserId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  families: { id: string }[],
  input: ExpenseInput,
): Promise<void> {
  validateExpenseInput(input, families);
  const amount = Math.floor(input.amount);
  const parts = [...new Set(input.participantFamilyIds)].filter((id) =>
    families.some((f) => f.id === id),
  );
  const weightByFamilyId = buildWeightByFamilyId({
    ...input,
    participantFamilyIds: parts,
  });
  const demo = input.perExpenseFamilyDemographicsByFamilyId;
  const demoClean =
    demo &&
    typeof demo === "object" &&
    Object.keys(demo).length > 0 &&
    input.splitMode === "weighted"
      ? demo
      : undefined;

  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.groups, groupId, SUB.expenses, expenseId);
  await updateDoc(ref, {
    amount,
    paidByFamilyId: input.paidByFamilyId,
    expenseDate: input.expenseDate,
    category: input.category,
    memo: input.memo.trim(),
    splitMode: input.splitMode,
    participantFamilyIds: parts,
    weightByFamilyId,
    participantUserIds: [],
    updatedAt: serverTimestamp(),
    perExpenseFamilyDemographicsByFamilyId: demoClean
      ? demoClean
      : deleteField(),
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
