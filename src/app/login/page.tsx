import { LoginForm } from "@/components/auth/login-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        ログイン
      </h1>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        メールアドレスとパスワードでログインします。Firebase コンソールで「メール／パスワード」認証を有効にしてください。
      </p>
      <LoginForm />
    </div>
  );
}
