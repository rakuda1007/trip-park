/** 旅行の日数（開始日・終了日が同じなら1日） */
export function calcTripNumDays(
  start: string | null,
  end: string | null,
): number {
  if (!start) return 0;
  const s = new Date(`${start}T12:00:00`);
  const e = end ? new Date(`${end}T12:00:00`) : s;
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** Day番号（1始まり）に対応する表示用の日付（tripStartDate 基準） */
export function dateLabelForTripDay(
  tripStartDate: string | null,
  dayIndexZeroBased: number,
): string | null {
  if (!tripStartDate) return null;
  const d = new Date(`${tripStartDate}T12:00:00`);
  d.setDate(d.getDate() + dayIndexZeroBased);
  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}
