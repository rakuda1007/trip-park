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
          旅行・キャンプを計画するときの、日程調整・目的地共有・旅程管理・精算をまとめる
          Web アプリです。
        </p>
        <FirebaseEnvHint />
        <HomeLandingActions />
      </div>
    </div>
  );
}
