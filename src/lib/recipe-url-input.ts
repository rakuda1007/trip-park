/** 本文からレシピURL一覧（1行1URL）を取り出す */
export function parseRecipeUrlLines(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t) out.push(t);
  }
  return out;
}

export function normalizeUrlListSignature(urls: string[]): string {
  return urls.map((u) => u.trim()).filter(Boolean).join("\n");
}
