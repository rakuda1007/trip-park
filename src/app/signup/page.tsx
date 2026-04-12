import { SignupForm } from "@/components/auth/signup-form";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "新規登録",
};

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        新規登録
      </h1>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        アカウントを作成すると、今後追加する旅行・日程調整などの機能が利用できるようになります。
      </p>
      <Suspense>
        <SignupForm />
      </Suspense>
    </div>
  );
}
