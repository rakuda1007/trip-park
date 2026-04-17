import "client-only";

import type { NotifyPayload } from "@/app/api/notify/route";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * 通知APIを呼び出す。
 * 失敗してもユーザー体験を損なわないよう例外を飲み込み、成功可否のみ返す（再通知UIなどで利用）。
 */
export async function sendNotification(payload: NotifyPayload): Promise<boolean> {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return false;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
