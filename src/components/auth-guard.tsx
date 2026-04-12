"use client";

import { useAuth } from "@/contexts/auth-context";
import { LoadingScreen } from "@/components/loading-screen";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";

function AuthGuardInner({ children }: { children: ReactNode }) {
  const { user, loading, authUnavailable } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading || authUnavailable) return;
    if (!user) {
      // 現在のパス+クエリを returnTo として /login に渡す
      const currentPath =
        pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
      router.replace(`/login?returnTo=${encodeURIComponent(currentPath)}`);
    }
  }, [user, loading, authUnavailable, router, pathname, searchParams]);

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

export function AuthGuard({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthGuardInner>{children}</AuthGuardInner>
    </Suspense>
  );
}
