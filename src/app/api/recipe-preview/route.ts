import { fetchRecipePreviewForUrl } from "@/lib/recipe-url-fetch";
import type { RecipePollCandidate } from "@/types/bulletin";
import { NextResponse } from "next/server";

const MAX_URLS = 15;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const urlsRaw = (body as { urls?: unknown }).urls;
  if (!Array.isArray(urlsRaw) || urlsRaw.length === 0) {
    return NextResponse.json(
      { error: "urls は1件以上の配列で指定してください" },
      { status: 400 },
    );
  }
  if (urlsRaw.length > MAX_URLS) {
    return NextResponse.json(
      { error: `URLは最大${MAX_URLS}件までです` },
      { status: 400 },
    );
  }
  const urls = urlsRaw.map((u) => String(u).trim()).filter(Boolean);
  if (urls.length === 0) {
    return NextResponse.json({ error: "有効なURLがありません" }, { status: 400 });
  }

  const candidates: RecipePollCandidate[] = await Promise.all(
    urls.map((u) => fetchRecipePreviewForUrl(u)),
  );

  return NextResponse.json({ candidates });
}
