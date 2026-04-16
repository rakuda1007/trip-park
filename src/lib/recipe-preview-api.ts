import type { RecipePollCandidate, RecipePollData } from "@/types/bulletin";

export async function fetchRecipePollFromUrls(
  urls: string[],
): Promise<RecipePollData> {
  const res = await fetch("/api/recipe-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  let j: { candidates?: RecipePollCandidate[]; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    throw new Error(
      typeof j.error === "string" ? j.error : "プレビュー取得に失敗しました",
    );
  }
  if (!j.candidates || !Array.isArray(j.candidates)) {
    throw new Error("プレビュー形式が不正です");
  }
  return { candidates: j.candidates };
}
