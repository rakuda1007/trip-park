"use client";

import { ensureUserDocument } from "@/lib/firestore/users";
import { isFirebaseConfigured } from "@/lib/firebase/env";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  /** Firebase 未設定などでクライアント認証が使えないとき true */
  authUnavailable: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUnavailable, setAuthUnavailable] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      setAuthUnavailable(true);
      return;
    }

    let unsub: (() => void) | undefined;
    let resolved = false;

    // Firebase Auth が応答しない場合のフォールバック（5秒でタイムアウト）
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setLoading(false);
      }
    }, 5000);

    try {
      const auth = getFirebaseAuth();
      unsub = onAuthStateChanged(auth, async (u) => {
        if (!resolved) resolved = true;
        clearTimeout(timeout);
        setUser(u);
        if (u) {
          try {
            await ensureUserDocument(u.uid, u.email, u.displayName);
          } catch (e) {
            console.error("ensureUserDocument failed:", e);
          }
        }
        setLoading(false);
      });
    } catch {
      clearTimeout(timeout);
      setAuthUnavailable(true);
      setLoading(false);
    }

    return () => {
      clearTimeout(timeout);
      unsub?.();
    };
  }, []);

  const value = useMemo(
    () => ({ user, loading, authUnavailable }),
    [user, loading, authUnavailable],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

