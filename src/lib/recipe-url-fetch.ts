import type { RecipePollCandidate } from "@/types/bulletin";

const UA =
  "Mozilla/5.0 (compatible; TripPark/1.0; +https://trip-park.example) AppleWebKit/537.36";

const MAX_HTML_BYTES = 900_000;

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseMetaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  if (m?.[1]) return decodeBasicEntities(m[1]);
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2?.[1] ? decodeBasicEntities(m2[1]) : null;
}

function flattenLdJsonNodes(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data.flatMap(flattenLdJsonNodes);
  if (typeof data === "object" && data !== null && "@graph" in data) {
    const g = (data as { "@graph"?: unknown })["@graph"];
    if (Array.isArray(g)) return g.flatMap(flattenLdJsonNodes);
  }
  return [data];
}

type LdRecipeBlock = {
  name?: string;
  image?: string | string[];
  recipeIngredient?: string[] | string;
  recipeInstructions?: unknown;
};

function pickRecipeFromLdJson(html: string): LdRecipeBlock | null {
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      for (const node of flattenLdJsonNodes(data)) {
        if (!node || typeof node !== "object") continue;
        const o = node as Record<string, unknown>;
        const type = o["@type"];
        const isRecipe =
          type === "Recipe" ||
          (Array.isArray(type) && type.includes("Recipe"));
        if (isRecipe) {
          return o as LdRecipeBlock;
        }
      }
    } catch {
      /* 次の script へ */
    }
  }
  return null;
}

/** クックパッド等のOG用合成バナー（料理写真ではない） */
function isOgCompositeBannerUrl(u: string): boolean {
  return /og-image\.cookpad\.com/i.test(u);
}

function extractHowToStepImageUrls(recipe: LdRecipeBlock | null): string[] {
  const out: string[] = [];
  const instr = recipe?.recipeInstructions;
  if (!Array.isArray(instr)) return out;
  for (const step of instr) {
    if (!step || typeof step !== "object") continue;
    const im = (step as Record<string, unknown>).image;
    if (typeof im === "string" && im.trim()) out.push(im.trim());
  }
  return out;
}

/** HTML 内のクックパッド本体写真（合成OGより優先） */
function extractCookpadJpPhotoUrls(html: string): string[] {
  const re =
    /https:\/\/img-global-jp\.cpcdn\.com\/(?:recipes|steps)\/[^"'\s<>]+?\.(?:jpe?g|webp)/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[0];
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/**
 * レシピページから「調理写真のみ」に近いURLを選ぶ。
 * クックパッドは og:image がロゴ入り合成のため、JSON-LD 手順画像や img-global を優先する。
 */
function pickBestRecipeImageUrl(
  pageUrl: string,
  html: string,
  recipe: LdRecipeBlock | null,
): string | null {
  const ogMeta = normalizeImage(pageUrl, parseMetaContent(html, "og:image") || undefined);
  const ldMain = recipe ? normalizeImage(pageUrl, recipe.image) : null;
  const stepImages = extractHowToStepImageUrls(recipe)
    .map((u) => normalizeImage(pageUrl, u))
    .filter((u): u is string => u !== null);
  const htmlJp = extractCookpadJpPhotoUrls(html)
    .map((u) => normalizeImage(pageUrl, u))
    .filter((u): u is string => u !== null);

  const preferReal = [
    ...htmlJp.filter((u): u is string => Boolean(u) && /\/recipes\//i.test(u)),
    ...stepImages.filter(
      (u): u is string => u !== null && !isOgCompositeBannerUrl(u),
    ),
    ...htmlJp.filter(Boolean),
    ...stepImages.filter((u): u is string => u !== null),
  ];

  for (const u of preferReal) {
    if (u && !isOgCompositeBannerUrl(u)) return u;
  }

  if (ldMain && !isOgCompositeBannerUrl(ldMain)) return ldMain;
  if (ogMeta && !isOgCompositeBannerUrl(ogMeta)) return ogMeta;
  return ldMain || ogMeta || preferReal[0] || null;
}

function normalizeImage(
  baseUrl: string,
  image: string | string[] | undefined,
): string | null {
  if (!image) return null;
  const first = Array.isArray(image) ? image[0] : image;
  if (typeof first !== "string" || !first.trim()) return null;
  try {
    return new URL(first.trim(), baseUrl).href;
  } catch {
    return first.trim();
  }
}

export async function fetchRecipePreviewForUrl(
  url: string,
): Promise<RecipePollCandidate> {
  const bad: RecipePollCandidate = {
    url,
    sourceTitle: null,
    imageUrl: null,
    ingredients: [],
    fetchError: null,
  };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ...bad, fetchError: "URLの形式が正しくありません" };
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { ...bad, fetchError: "http(s) のURLのみ対応しています" };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return {
      ...bad,
      fetchError: e instanceof Error ? e.message : "取得に失敗しました",
    };
  }

  if (!res.ok) {
    return { ...bad, fetchError: `HTTP ${res.status}` };
  }

  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);

  const recipe = pickRecipeFromLdJson(html);
  const title =
    (typeof recipe?.name === "string" && recipe.name) ||
    parseMetaContent(html, "og:title") ||
    null;
  const imageUrl = pickBestRecipeImageUrl(url, html, recipe);

  let ingredients: string[] = [];
  if (recipe?.recipeIngredient) {
    const ri = recipe.recipeIngredient;
    if (Array.isArray(ri)) {
      ingredients = ri.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof ri === "string") {
      ingredients = ri.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    }
  }

  const cleanTitle = title
    ? title.replace(/\s+by\s+.+$/i, "").replace(/\s*｜.*$/, "").trim()
    : null;

  return {
    url,
    sourceTitle: cleanTitle || null,
    imageUrl,
    ingredients,
    fetchError: null,
  };
}
