"use client";

import { useAuth } from "@/contexts/auth-context";
import { LoadingScreen } from "@/components/loading-screen";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

type PromoAuthRedirectProps = {
  enabled: boolean;
  children: ReactNode;
};

/**
 * ログイン済み（または auth 復元中）はプロモ本体を出さず、
 * /dashboard へ寄せる。未ログイン時だけ children（LP）を表示する。
 */
export function PromoAuthRedirect({ enabled, children }: PromoAuthRedirectProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (enabled && !loading && user) {
      router.replace("/dashboard");
    }
  }, [enabled, loading, router, user]);

  if (enabled && (loading || user)) {
    return <LoadingScreen label="アプリを開いています…" />;
  }

  return <>{children}</>;
}
