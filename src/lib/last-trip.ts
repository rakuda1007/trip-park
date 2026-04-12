/**
 * localStorage を使って、ユーザーごとに直近にアクセスした旅行IDを管理する
 */

const KEY_PREFIX = "trip-park:lastTripId:";

function storageKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

/** 直近の旅行IDを保存する */
export function saveLastTripId(uid: string, tripId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(uid), tripId);
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
  } catch {
    // ignore
  }
}
