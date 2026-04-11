"use client";

import { useAuth } from "@/contexts/auth-context";
import { joinGroupWithCode } from "@/lib/firestore/groups";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function JoinClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = searchParams.get("code");
    if (q) setCode(q.trim().toUpperCase());
  }, [searchParams]);

  const submit = useCallback(async () => {
    if (!user) return;
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError("招待コードを入力してください。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const gid = await joinGroupWithCode(user.uid, user.displayName, c);
      router.push(`/groups/${gid}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "参加に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }, [user, code, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
      <Link
        href="/groups"
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← グループ一覧
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        招待コードで参加
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        オーナーから共有された招待コードを入力してください。
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="join-code"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            招待コード
          </label>
          <input
            id="join-code"
            type="text"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例: A1B2C3D4"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {submitting ? "参加中…" : "参加する"}
        </button>
      </form>
    </div>
  );
}
