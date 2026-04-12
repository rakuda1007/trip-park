"use client";

import { useAuth } from "@/contexts/auth-context";
import { getInviteCodeInfo } from "@/lib/firestore/groups";
import type { InviteCodeDoc } from "@/types/group";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function WelcomeClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCode = searchParams.get("code") ?? "";
  const code = rawCode.trim().toUpperCase();

  const [info, setInfo] = useState<InviteCodeDoc | null | undefined>(undefined);
  const [fetchError, setFetchError] = useState(false);

  // 招待コード情報を取得（未ログインでも可）
  useEffect(() => {
    if (!code) {
      setInfo(null);
      return;
    }
    setFetchError(false);
    getInviteCodeInfo(code)
      .then((data) => setInfo(data))
      .catch(() => {
        setFetchError(true);
        setInfo(null);
      });
  }, [code]);

  // すでにログイン済みなら /join に直接転送
  useEffect(() => {
    if (!loading && user && code) {
      router.replace(`/join?code=${encodeURIComponent(code)}`);
    }
  }, [loading, user, code, router]);

  // コードなし
  if (!code) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          招待コードが見つかりません。招待リンクを再確認してください。
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-zinc-900 underline dark:text-zinc-100"
        >
          トップページへ
        </Link>
      </div>
    );
  }

  // ログイン済みユーザーは /join へリダイレクト中
  if (!loading && user) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">旅行ページに移動中…</p>
      </div>
    );
  }

  // 読み込み中
  if (info === undefined) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">招待情報を確認中…</p>
      </div>
    );
  }

  const joinReturnTo = `/join?code=${encodeURIComponent(code)}`;
  const loginHref = `/login?returnTo=${encodeURIComponent(joinReturnTo)}`;
  const signupHref = `/signup?returnTo=${encodeURIComponent(joinReturnTo)}`;

  // コードが無効
  if (info === null || fetchError) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          招待コード <span className="font-mono font-semibold">{code}</span>{" "}
          は無効か、有効期限が切れています。
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          招待リンクを送ってくれた方に再発行を依頼してください。
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-zinc-900 underline dark:text-zinc-100"
        >
          トップページへ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-8 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          旅行への招待
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {info.groupName}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          この旅行に参加するには、Trip Park のアカウントが必要です。
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <Link
          href={loginHref}
          className="block w-full rounded-md bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          ログインして参加
        </Link>
        <Link
          href={signupHref}
          className="block w-full rounded-md border border-zinc-300 px-4 py-3 text-center text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          新規登録して参加
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
        招待コード:{" "}
        <span className="font-mono">{code}</span>
      </p>
    </div>
  );
}
