import type { DestinationPollDoc } from "@/types/destination";
import { DESTINATION_DECIDE_MAX_PER_POLL } from "@/types/destination";

/** 投票ブロック doc から確定済み目的地名の配列（重複除去・最大件数まで） */
export function normalizeDecidedNamesFromPollDoc(
  data: DestinationPollDoc,
): string[] {
  const raw = data.decidedDestinationNames;
  if (Array.isArray(raw) && raw.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of raw) {
      const t = typeof s === "string" ? s.trim() : "";
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= DESTINATION_DECIDE_MAX_PER_POLL) break;
    }
    return out;
  }
  const single = data.decidedDestinationName?.trim();
  return single ? [single] : [];
}
