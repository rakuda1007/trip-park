import { FirebaseEnvHint } from "@/components/firebase-env-hint";
import { HomeLandingActions } from "@/components/home-landing-actions";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Trip Park
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          グループで旅行やキャンプを計画するときの、日程調整・お知らせ・旅程・精算をまとめるための
          Web アプリです（Phase 0: 認証とプロフィールの土台）。
        </p>
        <FirebaseEnvHint />
        <HomeLandingActions />
      </div>
    </div>
  );
}
