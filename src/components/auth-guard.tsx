"use client";

import { useAuth } from "@/contexts/auth-context";
import { LoadingScreen } from "@/components/loading-screen";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading, authUnavailable } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || authUnavailable) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, loading, authUnavailable, router]);

  if (authUnavailable) {
    return (
      <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        Firebase が未設定のためログインできません。.env.local を確認してください。
      </p>
    );
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
