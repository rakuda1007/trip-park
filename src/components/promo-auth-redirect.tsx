"use client";

import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PromoAuthRedirectProps = {
  enabled: boolean;
};

export function PromoAuthRedirect({ enabled }: PromoAuthRedirectProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (enabled && !loading && user) {
      router.replace("/dashboard");
    }
  }, [enabled, loading, router, user]);

  return null;
}
