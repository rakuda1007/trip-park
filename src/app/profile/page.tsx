import { AuthGuard } from "@/components/auth-guard";
import { ProfileForm } from "@/components/profile/profile-form";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プロフィール",
};

export default function ProfilePage() {
  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          プロフィール
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          表示名は Firebase Authentication と Firestore の users コレクションに保存されます。
        </p>
        <ProfileForm />

        <div className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            設定
          </h2>
          <div className="mt-4 space-y-2">
            <PushNotificationToggle />
            <Link
              href="/profile/households"
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  世帯マスタ
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  旅行で使う家族・グループの人数を登録
                </p>
              </div>
              <svg
                className="h-4 w-4 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/circles"
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  サークル
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  一緒に旅行する仲間の名簿を管理
                </p>
              </div>
              <svg
                className="h-4 w-4 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
