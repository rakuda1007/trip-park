/**
 * localStorage を使って、ユーザーごとに直近にアクセスした旅行IDを管理する
 */

const KEY_PREFIX = "trip-park:lastTripId:";
/** PWA 起動ショートカット用（uid 不要・ハッピーパスの二重ナビ回避） */
const PWA_LAST_GROUP_PATH_KEY = "trip-park:pwaLastGroupPath";

function storageKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

function isGroupHomePath(path: string): boolean {
  return /^\/groups\/[^/]+\/?$/.test(path);
}

/** 直近の旅行IDを保存する */
export function saveLastTripId(uid: string, tripId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(uid), tripId);
    localStorage.setItem(PWA_LAST_GROUP_PATH_KEY, `/groups/${tripId}`);
  } catch {
    // localStorage が使えない環境は無視
  }
}

/** 直近の旅行IDを取得する */
export function loadLastTripId(uid: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

/** 直近の旅行IDを削除する */
export function clearLastTripId(uid: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(uid));
    localStorage.removeItem(PWA_LAST_GROUP_PATH_KEY);
  } catch {
    // ignore
  }
}

/** PWA 起動用の直近旅行ホームパス（例: /groups/abc） */
export function loadPwaLastGroupPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const path = localStorage.getItem(PWA_LAST_GROUP_PATH_KEY);
    if (!path || !isGroupHomePath(path)) return null;
    return path.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function clearPwaLastGroupPath(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PWA_LAST_GROUP_PATH_KEY);
  } catch {
    // ignore
  }
}
