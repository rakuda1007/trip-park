import type { Timestamp } from "firebase/firestore";

/** 支出カテゴリ（仕様の例に沿う） */
export type ExpenseCategory = "food" | "transport" | "lodging" | "other";

/** 均等割り / 比率割（重み付き） */
export type ExpenseSplitMode = "equal" | "weighted";

export type ExpenseDoc = {
  /** 金額（円・整数） */
  amount: number;
  /** 立て替えた世帯（新規保存時は必須） */
  paidByFamilyId?: string;
  /** 旧データ互換 */
  paidByUserId?: string;
  /** YYYY-MM-DD */
  expenseDate: string;
  category: ExpenseCategory;
  memo: string;
  splitMode: ExpenseSplitMode;
  /** 負担の対象となる世帯 ID リスト（新形式） */
  participantFamilyIds?: string[];
  /** 重み（正の数）。均等割は全員 1、人数割は adultCount + childCount * childRatio */
  weightByFamilyId?: Record<string, number>;
  /** 旧データ互換: 以前はメンバー userId で保存していた */
  participantUserIds: string[];
  weightByUserId?: Record<string, number>;
  createdByUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
