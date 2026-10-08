import { AuthGuard } from "@/components/auth-guard";
import { NewGroupForm } from "./new-group-form";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "予定を作成",
};

export default function NewGroupPage() {
  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <Link
          href="/groups"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← 旅行一覧
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          予定を作成
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          旅行・飲み会・精算だけの箱を作れます。サークルを選ぶと、作成後にまとめて招待リンクを共有できます。
        </p>
        <NewGroupForm />
      </div>
    </AuthGuard>
  );
}
