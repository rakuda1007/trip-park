import { labelsForShape, resolvePlanShape } from "@/lib/plan-shape";
import type { GroupDoc, PlanShape, TripStatus } from "@/types/group";

/** ユーザー向けの旅行フェーズ表示名 */
export function tripStatusLabel(
  status: TripStatus | null | undefined,
  planShape?: PlanShape | null,
): string {
  const labels = labelsForShape(planShape ?? "trip");
  switch (status ?? "planning") {
    case "completed":
      return "精算完了";
    case "confirmed":
      return labels.confirmStatus;
    default:
      return labels.planningStatus;
  }
}

export function tripStatusLabelForGroup(
  group: Pick<GroupDoc, "status" | "planShape"> | null | undefined,
): string {
  return tripStatusLabel(group?.status, resolvePlanShape(group));
}

/** 短い説明（画面の補足文用） */
export function tripStatusDescription(
  status: TripStatus | null | undefined,
  planShape?: PlanShape | null,
): string {
  const shape = planShape ?? "trip";
  switch (status ?? "planning") {
    case "completed":
      return "支出の精算まで終えて、締めました。";
    case "confirmed":
      return shape === "settle_only"
        ? "支出の記録と精算を進める段階です。"
        : shape === "gathering"
          ? "開催の準備が整い、支出・精算を進める段階です。"
          : "旅程の準備が整い、支出・精算を進める段階です。";
    default:
      return shape === "settle_only"
        ? "参加世帯と支出を登録して、精算を進める段階です。"
        : shape === "gathering"
          ? "日時やお店など、集まりの準備を進めている段階です。"
          : "日程・目的地・旅程など、旅行の準備を進めている段階です。";
  }
}

/** 精算タブの締め操作向け */
export function settlementCloseLabels(
  isClosed: boolean,
  planShape?: PlanShape | null,
): {
  current: string;
  confirm: string;
  button: string;
} {
  const confirmLabel = labelsForShape(planShape ?? "trip").confirmStatus;
  if (isClosed) {
    return {
      current: "精算完了（締め済み）",
      confirm: `締めを取り消して「${confirmLabel}」に戻しますか？支出の記録は残ります。`,
      button: "締めを取り消す",
    };
  }
  return {
    current: "まだ締めていない（精算を続けられます）",
    confirm:
      "精算を完了にして締めますか？あとから「締めを取り消す」で戻せます。",
    button: "精算を完了して締める",
  };
}
