import type { Timestamp } from "firebase/firestore";

/** 支出カテゴリ（仕様の例に沿う） */
export type ExpenseCategory = "food" | "transport" | "lodging" | "other";

/** 均等割り / 比率割（重み付き） */
export type ExpenseSplitMode = "equal" | "weighted";

export type ExpenseDoc = {
  /** 金額（円・整数） */
  amount: number;
  /** 立て替えた世帯（新規保存時は必須。旧データでは無い場合あり） */
  paidByFamilyId?: string;
  /**
   * 旧データ互換: 以前はメンバー userId で保存していた。
   * `paidByFamilyId` が無いドキュメントの解決にのみ使う。
   */
  paidByUserId?: string;
  /** YYYY-MM-DD */
  expenseDate: string;
  category: ExpenseCategory;
  memo: string;
  splitMode: ExpenseSplitMode;
  /** 負担に含めるメンバー（チェックを外した人は除外） */
  participantUserIds: string[];
  /**
   * 負担の重み（正の数）。均等割は全員 1。
   * 比率割では大人=1、子供=（大人に対する割合）など。
   */
  weightByUserId?: Record<string, number>;
  createdByUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
