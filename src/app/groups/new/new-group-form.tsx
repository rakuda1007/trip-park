"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  listCircleMembers,
  listCircles,
  type CircleItem,
} from "@/lib/firestore/circles";
import { createGroup } from "@/lib/firestore/groups";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function NewGroupForm() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [inviteCircleId, setInviteCircleId] = useState("");
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [circleMemberCount, setCircleMemberCount] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void listCircles(user.uid)
      .then((list) => {
        setCircles(list);
        const fromQuery = searchParams.get("circle");
        if (fromQuery && list.some((c) => c.id === fromQuery)) {
          setInviteCircleId(fromQuery);
        }
      })
      .catch(() => setCircles([]));
  }, [user, searchParams]);

  useEffect(() => {
    if (!inviteCircleId) {
      setCircleMemberCount(null);
      return;
    }
    let cancelled = false;
    void listCircleMembers(inviteCircleId)
      .then((members) => {
        if (!cancelled) setCircleMemberCount(members.length);
      })
      .catch(() => {
        if (!cancelled) setCircleMemberCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCircleId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const n = name.trim();
    if (!n) {
      setError("旅行名を入力してください。");
      return;
    }
    if (tripStartDate && tripEndDate && tripEndDate < tripStartDate) {
      setError("終了日は開始日以降にしてください。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const gid = await createGroup(
        user.uid,
        user.displayName,
        n,
        description.trim() || null,
        tripStartDate || null,
        tripEndDate || tripStartDate || null,
      );
      const q = new URLSearchParams({ setup: "1" });
      if (inviteCircleId) q.set("circleInvite", inviteCircleId);
      // 精算前に詰まらないよう参加世帯へ。サークル指定時は招待共有も同画面で出す
      router.push(`/groups/${gid}/families?${q.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-md space-y-4">
      <div>
        <label
          htmlFor="group-name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          旅行名（例: 2026年春キャンプ）
        </label>
        <input
          id="group-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <label
          htmlFor="group-desc"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          説明（任意）
        </label>
        <textarea
          id="group-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <p className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          旅行日程（任意）
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          後から日程調整画面でも設定できます。
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            開始日
            <input
              type="date"
              value={tripStartDate}
              onChange={(e) => {
                const v = e.target.value;
                setTripStartDate(v);
                setTripEndDate((prev) => (!prev || prev < v ? v : prev));
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            終了日
            <input
              type="date"
              value={tripEndDate}
              min={tripStartDate || undefined}
              onChange={(e) => setTripEndDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
        <label
          htmlFor="invite-circle"
          className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
        >
          サークルから招待（任意）
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          作成後に、選んだサークルのメンバーへ招待リンクを共有できます。
        </p>
        {circles.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            まだサークルがありません。{" "}
            <Link
              href="/circles"
              className="font-medium text-emerald-800 underline dark:text-emerald-400"
            >
              サークルを作る
            </Link>
          </p>
        ) : (
          <>
            <select
              id="invite-circle"
              value={inviteCircleId}
              onChange={(e) => setInviteCircleId(e.target.value)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">選ばない</option>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.data.name}
                </option>
              ))}
            </select>
            {inviteCircleId && circleMemberCount != null ? (
              <p className="mt-1.5 text-xs text-zinc-500">
                メンバー {circleMemberCount} 人（作成後に共有画面を出します）
              </p>
            ) : null}
            <Link
              href="/circles"
              className="mt-2 inline-block text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
            >
              サークルを管理する
            </Link>
          </>
        )}
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
        {submitting ? "作成中…" : "作成する"}
      </button>
    </form>
  );
}
