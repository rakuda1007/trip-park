import type { PerExpenseFamilyDemographics } from "@/types/expense";
import type { FamilyDoc } from "@/types/family";

/** 世帯マスタから、この支出用の人数入力の初期値を作る */
export function demographicsFromFamilyDoc(
  data: FamilyDoc,
): PerExpenseFamilyDemographics {
  const adultCount = Math.max(0, Math.floor(Number(data.adultCount) || 0));
  const childCount = Math.max(0, Math.floor(Number(data.childCount) || 0));
  const childRatio =
    typeof data.childRatio === "number" &&
    Number.isFinite(data.childRatio) &&
    data.childRatio >= 0
      ? data.childRatio
      : 1;
  return { adultCount, childCount, childRatio };
}

/** 大人1＝1、子供は childRatio 倍して合算した負担重み（0 のときは人数割に使えない） */
export function weightFromDemographics(
  d: PerExpenseFamilyDemographics,
): number {
  const cr =
    typeof d.childRatio === "number" &&
    Number.isFinite(d.childRatio) &&
    d.childRatio >= 0
      ? d.childRatio
      : 1;
  const a = Math.max(0, Math.floor(Number(d.adultCount) || 0));
  const c = Math.max(0, Math.floor(Number(d.childCount) || 0));
  const w = a + c * cr;
  return w > 0 ? w : 0;
}

export function validatePerExpenseDemographicsForFamilies(
  participantFamilyIds: string[],
  byId: Record<string, PerExpenseFamilyDemographics>,
): string | null {
  for (const fid of participantFamilyIds) {
    const d = byId[fid];
    if (!d) {
      return "人数調整モードでは、負担対象の各世帯について大人・子供・比率を入力してください。";
    }
    const w = weightFromDemographics(d);
    if (w <= 0 || !Number.isFinite(w)) {
      return "各世帯について、大人・子供の人数と子供比率から正の負担重みになるようにしてください。";
    }
  }
  return null;
}
