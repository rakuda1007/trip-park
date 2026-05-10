"use client";

import { useAuth } from "@/contexts/auth-context";
import { mapAuthError } from "@/lib/auth/firebase-errors";
import {
  AUTH_RETURN_TO_KEY,
  safeInternalPath,
} from "@/lib/auth-return-to";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/env";
import { ensureUserDocument } from "@/lib/firestore/users";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SignupForm() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get("returnTo");
  const returnToSafe = safeInternalPath(returnToRaw);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = safeInternalPath(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    if (q) sessionStorage.setItem(AUTH_RETURN_TO_KEY, q);
    else sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      const stored = safeInternalPath(sessionStorage.getItem(AUTH_RETURN_TO_KEY));
      const target = returnToSafe ?? stored ?? "/dashboard";
      sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      router.replace(target);
    }
  }, [user, loading, router, returnToSafe]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isFirebaseConfigured()) {
      setError("Firebase が設定されていません。");
      return;
    }
    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const name = displayName.trim();
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
      await ensureUserDocument(
        cred.user.uid,
        cred.user.email,
        name || cred.user.displayName,
      );
      router.refresh();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      setError(mapAuthError(code));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isFirebaseConfigured()) {
    return (
      <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
        .env.local に Firebase の公開設定を追加してください。
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <div>
        <label
          htmlFor="signup-name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          表示名（任意）
        </label>
        <input
          id="signup-name"
          type="text"
          autoComplete="nickname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <label
          htmlFor="signup-email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          メールアドレス
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <label
          htmlFor="signup-password"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          パスワード（6文字以上）
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting || loading}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {submitting ? "登録中…" : "アカウントを作成"}
      </button>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        既にアカウントがある方は{" "}
        <Link
          href={
            returnToSafe
              ? `/login?returnTo=${encodeURIComponent(returnToSafe)}`
              : "/login"
          }
          className="font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          ログイン
        </Link>
      </p>
    </form>
  );
}
