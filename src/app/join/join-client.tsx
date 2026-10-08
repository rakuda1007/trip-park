"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  getInviteCodeInfo,
  getMemberForUser,
  joinGroupWithCode,
} from "@/lib/firestore/groups";
import type { InviteCodeDoc } from "@/types/group";
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
  const [invite, setInvite] = useState<InviteCodeDoc | null | undefined>(
    undefined,
  );
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    const q = searchParams.get("code");
    if (q) setCode(q.trim().toUpperCase());
  }, [searchParams]);

  // 招待プレビュー（旅行名・既参加）
  useEffect(() => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setInvite(undefined);
      setAlreadyMember(false);
      return;
    }

    let cancelled = false;
    setInvite(undefined);
    setAlreadyMember(false);

    void (async () => {
      try {
        const info = await getInviteCodeInfo(c);
        if (cancelled) return;
        setInvite(info);
        if (!info || !user) {
          setAlreadyMember(false);
          return;
        }
        const member = await getMemberForUser(info.groupId, user.uid).catch(
          () => null,
        );
        if (cancelled) return;
        setAlreadyMember(!!member);
      } catch {
        if (!cancelled) {
          setInvite(null);
          setAlreadyMember(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, user]);

  // 既参加なら旅行ホームへソフトランディング
  useEffect(() => {
    if (!alreadyMember || !invite?.groupId) return;
    router.replace(`/groups/${invite.groupId}`);
  }, [alreadyMember, invite?.groupId, router]);

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
      const { groupId, alreadyMember: wasMember } = await joinGroupWithCode(
        user.uid,
        user.displayName,
        c,
      );
      if (wasMember) {
        router.replace(`/groups/${groupId}`);
      } else {
        router.push(`/groups/${groupId}/families?setup=1`);
      }
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

  const previewReady = code.trim().length >= 4 && invite !== undefined;
  const tripName = invite?.groupName?.trim() || null;

  if (alreadyMember && invite?.groupId) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">
          すでに参加しています。旅行を開いています…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
      <Link
        href="/groups"
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 旅行一覧
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        招待コードで参加
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        オーナーから共有された招待コードを入力してください。
      </p>

      {previewReady && invite && tripName ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            参加する旅行
          </p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {tripName}
          </p>
          {user ? (
            <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-100/80">
              下のボタンを押すと、この旅行に参加できます。
            </p>
          ) : null}
        </div>
      ) : null}

      {previewReady && invite === null ? (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          この招待コードは無効か、有効期限が切れています。
        </div>
      ) : null}

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
          disabled={
            submitting ||
            code.trim().length < 4 ||
            invite === null ||
            (code.trim().length >= 4 && invite === undefined)
          }
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {submitting
            ? "参加中…"
            : tripName
              ? `「${tripName}」に参加する`
              : "参加する"}
        </button>
      </form>
    </div>
  );
}
