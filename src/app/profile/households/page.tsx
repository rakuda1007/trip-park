import { AuthGuard } from "@/components/auth-guard";
import { HouseholdsClient } from "./households-client";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "世帯マスタ",
};

export default function HouseholdsPage() {
  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <Link
          href="/profile"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← プロフィール
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          世帯マスタ
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          旅行に参加する世帯の情報を登録します。旅行ごとに「何人参加するか」を指定すると、精算が世帯名単位でまとめられます。
        </p>
        <div className="mt-6">
          <HouseholdsClient />
        </div>
      </div>
    </AuthGuard>
  );
}
