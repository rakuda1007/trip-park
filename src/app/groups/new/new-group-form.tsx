"use client";

import { useAuth } from "@/contexts/auth-context";
import { createGroup } from "@/lib/firestore/groups";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewGroupForm() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      router.push(`/groups/${gid}`);
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
