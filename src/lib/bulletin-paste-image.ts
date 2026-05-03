/** カーソル位置に文字列を挿入（制御コンポーネント用） */
export function insertTextAtSelection(
  value: string,
  insert: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  return value.slice(0, start) + insert + value.slice(end);
}

/** クリップボードイベントから画像ファイルだけ取り出す */
export function takeClipboardImageFile(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
