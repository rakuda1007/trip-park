import type {
  BulletinRecipeVoteDoc,
  BulletinTopicDoc,
  RecipeMealSlot,
} from "@/types/bulletin";

export const MAX_RATED_CANDIDATES = 5;
export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** Firestore から読んだ投票を候補数に合わせた配列に正規化 */
export function normalizeRecipeRatings(
  data: BulletinRecipeVoteDoc,
  candidateCount: number,
): number[] {
  const n = candidateCount;
  if (n <= 0) return [];
  if (
    data.ratings &&
    Array.isArray(data.ratings) &&
    data.ratings.length === n
  ) {
    const raw = data.ratings.map((x) => {
      const v = Math.floor(Number(x));
      if (!Number.isFinite(v) || v <= 0) return 0;
      return Math.min(MAX_SCORE, Math.max(0, v));
    });
    /** 1〜5はユーザーごとに1回ずつ。重複は先頭の候補のみ残す */
    return dedupeScoresFirstCandidateWins(raw, n);
  }
  if (
    typeof data.candidateIndex === "number" &&
    data.candidateIndex >= 0 &&
    data.candidateIndex < n
  ) {
    const out = Array<number>(n).fill(0);
    out[data.candidateIndex] = MAX_SCORE;
    return out;
  }
  return Array<number>(n).fill(0);
}

/** 同じ点数が複数候補に付いている場合、先の候補のみ残す */
export function dedupeScoresFirstCandidateWins(
  ratings: number[],
  n: number,
): number[] {
  const used = new Set<number>();
  const out = Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const r = ratings[i] ?? 0;
    if (r < MIN_SCORE || r > MAX_SCORE) continue;
    if (used.has(r)) continue;
    used.add(r);
    out[i] = r;
  }
  return out;
}

export function countRatedCandidates(ratings: number[]): number {
  return ratings.filter((r) => r >= MIN_SCORE && r <= MAX_SCORE).length;
}

export function validateRecipeRatings(ratings: number[]): string | null {
  const used = new Set<number>();
  for (const r of ratings) {
    if (r === 0) continue;
    if (r < MIN_SCORE || r > MAX_SCORE) {
      return `点数は${MIN_SCORE}〜${MAX_SCORE}で指定してください`;
    }
    if (used.has(r)) {
      return `同じ点数（${r}点）は1つのレシピにしか付けられません`;
    }
    used.add(r);
  }
  if (used.size > MAX_RATED_CANDIDATES) {
    return `評価できる候補は最大${MAX_RATED_CANDIDATES}件までです`;
  }
  return null;
}

export type MealLineForTrip = {
  meal: RecipeMealSlot;
  recipeTitle: string;
  url: string;
  topicTitle: string;
  topicId: string;
};

/** 旅程のある Day に紐づく献立（掲示板のレシピ投票確定から） */
export function collectMealsForDayFromBulletin(
  dayNumber: number,
  topics: { id: string; data: BulletinTopicDoc }[],
): MealLineForTrip[] {
  const mealOrder: Record<RecipeMealSlot, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
  };
  const out: MealLineForTrip[] = [];
  for (const { id, data } of topics) {
    if (data.category !== "recipe_vote" || !data.recipePollResolution) continue;
    const poll = data.recipePoll;
    if (!poll?.candidates?.length) continue;
    for (const a of data.recipePollResolution.assignments) {
      if (a.dayNumber !== dayNumber) continue;
      const cand = poll.candidates[a.candidateIndex];
      if (!cand) continue;
      out.push({
        meal: a.meal,
        recipeTitle: cand.sourceTitle || cand.url,
        url: cand.url,
        topicTitle: data.title,
        topicId: id,
      });
    }
  }
  out.sort((a, b) => mealOrder[a.meal] - mealOrder[b.meal]);
  return out;
}
