"use client";

import { useAuth } from "@/contexts/auth-context";
import { mapAuthError } from "@/lib/auth/firebase-errors";
import { updateUserProfileFields } from "@/lib/firestore/users";
import { updateProfile } from "firebase/auth";
import { useEffect, useState } from "react";

export function ProfileForm() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(
    () => user?.displayName ?? "",
  );

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.uid, user?.displayName]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const currentUser = user;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSubmitting(true);
    try {
      const name = displayName.trim() || null;
      await updateProfile(currentUser, { displayName: name ?? "" });
      await updateUserProfileFields(currentUser.uid, { displayName: name });
      setMessage("保存しました。");
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

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-md space-y-4">
      <div>
        <label
          htmlFor="profile-email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          メールアドレス
        </label>
        <input
          id="profile-email"
          type="email"
          value={user.email ?? ""}
          disabled
          className="mt-1 w-full cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400"
        />
        <p className="mt-1 text-xs text-zinc-500">変更は Firebase コンソールから行ってください。</p>
      </div>
      <div>
        <label
          htmlFor="profile-name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          表示名
        </label>
        <input
          id="profile-name"
          type="text"
          autoComplete="nickname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
      ) : null}
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
        {submitting ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
