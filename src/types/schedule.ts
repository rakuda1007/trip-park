/** ○ / △ / × */
export type ScheduleAnswer = "yes" | "maybe" | "no";

/** 候補の期間（YYYY-MM-DD）。1日のみのときは startDate === endDate */
export type ScheduleCandidateDoc = {
  startDate: string;
  endDate: string;
  /** 開始日と同じ。一覧のソート用（Firestore orderBy と旧データ互換） */
  date?: string;
  createdAt: unknown;
  createdBy: string;
};

export type ScheduleResponseDoc = {
  userId: string;
  candidateId: string;
  answer: ScheduleAnswer;
  updatedAt: unknown;
};

export type ScheduleConfigDoc = {
  confirmedCandidateId: string | null;
  confirmedStartDate: string | null;
  confirmedEndDate: string | null;
  confirmedAt: unknown | null;
  confirmedBy: string | null;
  /** 旧データ（単一日）。読み取り時は開始・終了に正規化 */
  confirmedDate?: string | null;
};
