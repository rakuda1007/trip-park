import "client-only";

import type { NotifyPayload } from "@/app/api/notify/route";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * 通知APIを呼び出す。
 * 失敗してもユーザー体験を損なわないよう例外を飲み込む。
 */
export async function sendNotification(payload: NotifyPayload): Promise<void> {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    await fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // 通知送信の失敗はメイン処理に影響させない
  }
}
