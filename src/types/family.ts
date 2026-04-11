import type { Timestamp } from "firebase/firestore";

/** グループ内の家族（世帯）。精算を家族単位でまとめるために使う。 */
export type FamilyDoc = {
  /** 表示名（例: 奥田、大木） */
  name: string;
  /** 大人の人数（メモ・表示用。メンバー割当と一致しない場合もあり） */
  adultCount: number;
  /** 子供の人数（メモ・表示用） */
  childCount: number;
  /**
   * 子供1人の負担重み（大人1人＝1）。世帯にメンバーが2人以上いる場合に必須。
   * 一人世帯では 1 を保存（未使用）。旧データでは欠ける場合あり。
   */
  childRatio?: number;
  /** この世帯に含めるグループメンバー（アカウント）の userId */
  memberUserIds: string[];
  createdByUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
