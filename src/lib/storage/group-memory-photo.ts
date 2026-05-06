import { getFirebaseStorage } from "@/lib/firebase/client";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export const GROUP_MEMORY_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

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

/** 旅行の思い出写真を Storage にアップロードし、表示用URLを返す */
export async function uploadGroupMemoryPhoto(
  groupId: string,
  uid: string,
  file: File,
): Promise<string> {
  if (file.size > GROUP_MEMORY_PHOTO_MAX_BYTES) {
    throw new Error("画像は8MB以内にしてください。");
  }
  const mime = file.type || "image/jpeg";
  if (!mime.startsWith("image/")) {
    throw new Error("画像ファイルのみアップロードできます。");
  }

  const ext = extensionForMime(mime);
  const objectPath = `groups/${groupId}/memory_photos/${uid}/${Date.now()}_${randomSuffix()}.${ext}`;
  const storage = getFirebaseStorage();
  const storageRef = ref(storage, objectPath);
  await uploadBytes(storageRef, file, { contentType: mime });
  return getDownloadURL(storageRef);
}
