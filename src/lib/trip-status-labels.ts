import type { TripStatus } from "@/types/group";

/** ユーザー向けの旅行フェーズ表示名 */
export function tripStatusLabel(status: TripStatus | null | undefined): string {
  switch (status ?? "planning") {
    case "completed":
      return "精算完了";
    case "confirmed":
      return "旅行確定";
    default:
      return "計画中";
  }
}

/** 短い説明（画面の補足文用） */
export function tripStatusDescription(
  status: TripStatus | null | undefined,
): string {
  switch (status ?? "planning") {
    case "completed":
      return "支出の精算まで終えて、旅行を締めました。";
    case "confirmed":
      return "旅程の準備が整い、支出・精算を進める段階です。";
    default:
      return "日程・目的地・旅程など、旅行の準備を進めている段階です。";
  }
}

/** 精算タブの締め操作向け */
export function settlementCloseLabels(isClosed: boolean): {
  current: string;
  confirm: string;
  button: string;
} {
  if (isClosed) {
    return {
      current: "精算完了（旅行を締め済み）",
      confirm: "締めを取り消して「旅行確定」に戻しますか？支出の記録は残ります。",
      button: "締めを取り消す",
    };
  }
  return {
    current: "まだ締めていない（精算を続けられます）",
    confirm:
      "精算を完了にして旅行を締めますか？あとから「締めを取り消す」で戻せます。",
    button: "精算を完了して締める",
  };
}
