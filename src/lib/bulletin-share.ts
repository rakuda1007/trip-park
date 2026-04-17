import "client-only";

/** LINE の text URL 長に余裕を持たせた上限 */
const MAX_SHARE_TEXT_LENGTH = 1800;

export type BulletinShareLineParams = {
  groupName: string;
  topicTitle: string;
  /** 絶対 URL（https://…） */
  absoluteUrl: string;
  comment?: string;
};

/**
 * LINE「トークルーム選択」用のテキスト。
 *（Web Share API で別アプリを選んだ場合とは別経路）
 */
export function buildLineShareText(p: BulletinShareLineParams): string {
  const lines = [
    `【Trip Park】${p.groupName}`,
    `「${p.topicTitle}」`,
    p.comment?.trim() ?? "",
    p.absoluteUrl,
  ].filter((line) => line.length > 0);
  let text = lines.join("\n");
  if (text.length > MAX_SHARE_TEXT_LENGTH) {
    text = text.slice(0, MAX_SHARE_TEXT_LENGTH - 1) + "…";
  }
  return text;
}

/**
 * 可能なら Web Share API（スマホで LINE 等を選択）、
 * 不可なら LINE の text スキームで別タブを開く。
 */
export async function shareBulletinTopicPreferred(
  p: BulletinShareLineParams,
): Promise<void> {
  const { absoluteUrl, groupName, topicTitle, comment } = p;
  const title = `【${groupName}】${topicTitle}`;
  const textBlock = comment?.trim()
    ? `${comment.trim()}\n\n${absoluteUrl}`
    : `${topicTitle}\n${absoluteUrl}`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title,
        text: textBlock,
        url: absoluteUrl,
      });
      return;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return;
    }
  }

  const lineText = buildLineShareText(p);
  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(lineText)}`;
  window.open(lineUrl, "_blank", "noopener,noreferrer");
}
