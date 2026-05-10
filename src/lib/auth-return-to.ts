/** sessionStorage キー（ログイン／登録後の safe な内部パスのみ保持） */
export const AUTH_RETURN_TO_KEY = "trip_park_auth_return_to";

/**
 * アプリ内へのリダイレクト先のみ許可（オープンリダイレクト対策）。
 * 相対パス `/...` で始まり、`//` で始まらないもの。
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  return t;
}
