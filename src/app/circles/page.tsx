import { AuthGuard } from "@/components/auth-guard";
import { CirclesClient } from "./circles-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "サークル",
};

export default function CirclesPage() {
  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          サークル
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          一緒に旅行する仲間の名簿を管理します。旅行を作成するときに選ぶと、そのメンバーへ招待リンクをまとめて共有できます。
        </p>
        <div className="mt-6">
          <CirclesClient />
        </div>
      </div>
    </AuthGuard>
  );
}
