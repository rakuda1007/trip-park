"use client";

import { useAuth } from "@/contexts/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/env";

/**
 * 未ログイン時のみ、開発用の Firebase 公開設定の有無を表示する。
 */
export function FirebaseEnvHint() {
  const { user, loading } = useAuth();

  if (loading || user) {
    return null;
  }

  const ok = isFirebaseConfigured();

  return (
    <p
      className={`mt-4 rounded-md px-3 py-2 text-sm ${
        ok
          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
          : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
      }`}
    >
      Firebase 公開設定:{" "}
      {ok ? "必須項目が揃っています" : "未設定または不足があります（.env.local を確認）"}
    </p>
  );
}
