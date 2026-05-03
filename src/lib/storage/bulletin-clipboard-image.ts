import { getFirebaseStorage } from "@/lib/firebase/client";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

/** Storage ルールと揃える（クライアント側の事前チェック） */
export const BULLETIN_CLIPBOARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "jpg";
}

function randomSuffix(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * クリップボードから貼った画像を Storage に置き、共有用のダウンロード URL を返す。
 * 本文には `![alt](url)` 形式で埋め込む想定。
 */
export async function uploadBulletinClipboardImage(
  groupId: string,
  uid: string,
  file: Blob,
): Promise<string> {
  if (file.size > BULLETIN_CLIPBOARD_IMAGE_MAX_BYTES) {
    throw new Error("画像は5MB以内にしてください。");
  }
  const mime = file.type || "image/jpeg";
  if (!mime.startsWith("image/")) {
    throw new Error("画像ファイルのみ貼り付けできます。");
  }

  const ext = extensionForMime(mime);
  const objectPath = `groups/${groupId}/bulletin_images/${uid}/${Date.now()}_${randomSuffix()}.${ext}`;
  const storage = getFirebaseStorage();
  const r = ref(storage, objectPath);
  await uploadBytes(r, file, { contentType: mime });
  return getDownloadURL(r);
}
