import type {
  GroupDoc,
  PlaceFixed,
  PlaceMode,
  PlanShape,
  StepAvailability,
} from "@/types/group";

export type PlanStepKey = "schedule" | "place" | "itinerary" | "settlement";

export type ResolvedPlanConfig = {
  planShape: PlanShape;
  placeMode: PlaceMode;
  schedule: StepAvailability;
  place: StepAvailability;
  itinerary: StepAvailability;
  sharingEnabled: boolean;
  labels: {
    schedule: string;
    place: string;
    itinerary: string;
    settlement: string;
    shape: string;
    afterSection: string;
    confirmStatus: string;
    planningStatus: string;
  };
};

const SHAPE_DEFAULTS: Record<
  PlanShape,
  {
    schedule: StepAvailability;
    place: StepAvailability;
    itinerary: StepAvailability;
    placeMode: PlaceMode;
    sharingEnabled: boolean;
  }
> = {
  trip: {
    schedule: "required",
    place: "required",
    itinerary: "required",
    placeMode: "vote",
    sharingEnabled: true,
  },
  gathering: {
    schedule: "required",
    place: "required",
    itinerary: "off",
    placeMode: "fixed",
    sharingEnabled: false,
  },
  settle_only: {
    schedule: "optional",
    place: "off",
    itinerary: "off",
    placeMode: "skip",
    sharingEnabled: false,
  },
};

export function resolvePlanShape(
  group: Pick<GroupDoc, "planShape"> | null | undefined,
): PlanShape {
  return group?.planShape ?? "trip";
}

/** 未保存レガシーデータ向けの placeMode 推定（polls 件数は任意） */
export function resolvePlaceMode(
  group: Pick<GroupDoc, "planShape" | "placeMode" | "destination"> | null | undefined,
  pollCount = 0,
): PlaceMode {
  if (group?.placeMode) return group.placeMode;
  const shape = resolvePlanShape(group);
  if (shape === "settle_only") return "skip";
  if (shape === "gathering") return "fixed";
  if (pollCount > 0) return "vote";
  if (group?.destination?.trim()) return "fixed";
  return "vote";
}

export function resolvePlanConfig(
  group: GroupDoc | null | undefined,
  pollCount = 0,
): ResolvedPlanConfig {
  const planShape = resolvePlanShape(group);
  const defaults = SHAPE_DEFAULTS[planShape];
  const o = group?.stepOverrides;

  const schedule = o?.schedule ?? defaults.schedule;
  let place = o?.place ?? defaults.place;
  const itinerary = o?.itinerary ?? defaults.itinerary;
  const sharingEnabled =
    o?.sharing === "on"
      ? true
      : o?.sharing === "off"
        ? false
        : defaults.sharingEnabled;

  let placeMode = resolvePlaceMode(group, pollCount);
  if (place === "off") placeMode = "skip";
  if (placeMode === "skip") place = "off";

  const labels = labelsForShape(planShape);

  return {
    planShape,
    placeMode,
    schedule,
    place,
    itinerary,
    sharingEnabled,
    labels,
  };
}

export function labelsForShape(planShape: PlanShape): ResolvedPlanConfig["labels"] {
  switch (planShape) {
    case "gathering":
      return {
        schedule: "日時",
        place: "お店",
        itinerary: "当日の流れ",
        settlement: "精算",
        shape: "飲み会・食事",
        afterSection: "集まりのあと",
        confirmStatus: "開催確定",
        planningStatus: "調整中",
      };
    case "settle_only":
      return {
        schedule: "日時",
        place: "場所",
        itinerary: "旅程",
        settlement: "精算",
        shape: "シンプル精算",
        afterSection: "精算のあと",
        confirmStatus: "精算中",
        planningStatus: "精算の準備中",
      };
    default:
      return {
        schedule: "日程",
        place: "目的地",
        itinerary: "旅程",
        settlement: "精算",
        shape: "旅行",
        afterSection: "旅のあと",
        confirmStatus: "旅行確定",
        planningStatus: "計画中",
      };
  }
}

export function defaultsForCreate(planShape: PlanShape): {
  placeMode: PlaceMode;
  placeFixed: PlaceFixed | null;
} {
  const d = SHAPE_DEFAULTS[planShape];
  return { placeMode: d.placeMode, placeFixed: null };
}

export function isStepVisible(availability: StepAvailability): boolean {
  return availability !== "off";
}

export function isStepRequired(availability: StepAvailability): boolean {
  return availability === "required";
}

/** 作成フォームの選択肢 */
export const PLAN_SHAPE_OPTIONS: {
  value: PlanShape;
  title: string;
  description: string;
  /** 形を変えたときの短い注意 */
  convertHint: string;
}[] = [
  {
    value: "settle_only",
    title: "シンプル精算",
    description: "日程やお店は不要。世帯と支出・精算だけ使います。",
    convertHint: "場所・旅程の画面は隠れます（データは残ります）。",
  },
  {
    value: "gathering",
    title: "飲み会・食事",
    description: "日時とお店を軽く決めて、連絡・精算します。",
    convertHint: "旅程は非表示になり、場所は「お店」として扱います。",
  },
  {
    value: "trip",
    title: "旅行",
    description: "日程・目的地・旅程まで含めて計画します。",
    convertHint: "日程・目的地・旅程の工程が再び表示されます。",
  },
];

/** 招待カード用の短い呼び方 */
export function inviteKindLabel(planShape: PlanShape | null | undefined): string {
  switch (planShape ?? "trip") {
    case "gathering":
      return "飲み会・食事への招待";
    case "settle_only":
      return "精算への招待";
    default:
      return "旅行への招待";
  }
}

export function inviteJoinNoun(planShape: PlanShape | null | undefined): string {
  switch (planShape ?? "trip") {
    case "gathering":
      return "この集まり";
    case "settle_only":
      return "この精算";
    default:
      return "この旅行";
  }
}

/** 招待リンク共有用テキスト（LINE・クリップボード共通） */
export function buildInviteShareText(
  groupName: string,
  planShape: PlanShape | null | undefined,
  welcomeUrl: string,
): string {
  return `${inviteKindLabel(planShape)}「${groupName}」\n${inviteJoinNoun(planShape)}に参加はこちらから👇\n${welcomeUrl}`;
}

export function buildInviteShareTitle(
  groupName: string,
  planShape: PlanShape | null | undefined,
): string {
  return `「${groupName}」への招待（${labelsForShape(resolvePlanShape({ planShape })).shape}）`;
}

/** 形ごとの買い出しデフォルト（作成フォーム初期値用） */
export function defaultSharingEnabled(planShape: PlanShape): boolean {
  return SHAPE_DEFAULTS[planShape].sharingEnabled;
}
