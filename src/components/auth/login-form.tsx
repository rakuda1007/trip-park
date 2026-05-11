"use client";

import { useAuth } from "@/contexts/auth-context";
import { mapAuthError } from "@/lib/auth/firebase-errors";
import {
  AUTH_RETURN_TO_KEY,
  consumeAuthReturnToPath,
  safeInternalPath,
} from "@/lib/auth-return-to";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/env";
import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function LoginForm() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get("returnTo");
  const returnToSafe = safeInternalPath(returnToRaw);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** フォーム送信で既に replace した直後の onAuth 同期遷移を抑止（returnTo の二重消費防止） */
  const suppressAuthSyncRedirect = useRef(false);

  /** URL の returnTo を確実に保持（useSearchParams の初期空振り対策）。URL に無いときは古い値を消す */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = safeInternalPath(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    if (q) sessionStorage.setItem(AUTH_RETURN_TO_KEY, q);
    else sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  }, []);

  useEffect(() => {
    if (!user) suppressAuthSyncRedirect.current = false;
  }, [user]);

  useEffect(() => {
    if (!loading && user) {
      if (suppressAuthSyncRedirect.current) {
        suppressAuthSyncRedirect.current = false;
        return;
      }
      router.replace(consumeAuthReturnToPath(returnToSafe));
    }
  }, [user, loading, router, returnToSafe]);

  const SIGN_IN_TIMEOUT_MS = 60_000;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isFirebaseConfigured()) {
      setError("Firebase が設定されていません。");
      return;
    }
    setSubmitting(true);
    try {
      await Promise.race([
        signInWithEmailAndPassword(
          getFirebaseAuth(),
          email.trim(),
          password,
        ),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(Object.assign(new Error("timeout"), { code: "auth/timeout-client" }));
          }, SIGN_IN_TIMEOUT_MS);
        }),
      ]);
      suppressAuthSyncRedirect.current = true;
      const target = consumeAuthReturnToPath(returnToSafe);
      router.replace(target);
      void router.refresh();
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
          htmlFor="login-email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          メールアドレス
        </label>
        <input
          id="login-email"
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
          htmlFor="login-password"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          パスワード
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
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
        {submitting ? "送信中…" : "ログイン"}
      </button>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        アカウントをお持ちでない方は{" "}
        <Link
          href={
            returnToSafe
              ? `/signup?returnTo=${encodeURIComponent(returnToSafe)}`
              : "/signup"
          }
          className="font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          新規登録
        </Link>
      </p>
    </form>
  );
}
