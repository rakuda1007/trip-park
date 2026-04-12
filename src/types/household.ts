/**
 * 世帯マスタ（ユーザーごとに登録する家族・グループの原本データ）
 * Firestore: users/{uid}/households/{householdId}
 */
export type HouseholdDoc = {
  /** 世帯名。精算時の表示名として使用 */
  name: string;
  /** デフォルト大人数 */
  defaultAdultCount: number;
  /** デフォルト子供数 */
  defaultChildCount: number;
  /**
   * 子供1人あたりの負担比率（大人を 1.0 として）
   * 例: 0.5 → 子供は大人の半額
   */
  defaultChildRatio: number;
  /** 同じ世帯の他の Trip Park アカウントの UID */
  memberUserIds: string[];
  createdAt: unknown;
  updatedAt: unknown;
};
