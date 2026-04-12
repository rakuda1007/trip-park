"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/env";
import { clearLastTripId } from "@/lib/last-trip";
import { TripSelector } from "@/components/trip-selector";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useState } from "react";

export function AppHeader() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (!isFirebaseConfigured()) return;
    setSigningOut(true);
    try {
      if (user) clearLastTripId(user.uid);
      await signOut(getFirebaseAuth());
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
        {/* ロゴ */}
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Trip Park
        </Link>

        {/* ログイン済みなら旅行セレクターを中央に */}
        {!loading && user && (
          <div className="flex-1">
            <TripSelector />
          </div>
        )}

        {/* 右ナビ */}
        <nav className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm sm:gap-3">
          {!loading && user ? (
            <>
              <Link
                href="/profile"
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                プロフィール
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={signingOut}
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {signingOut ? "ログアウト中…" : "ログアウト"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ログイン
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                新規登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
