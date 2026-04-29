import Link from "next/link";
import { FirebaseEnvHint } from "@/components/firebase-env-hint";
import { HomeLandingActions } from "@/components/home-landing-actions";

const featureCards = [
  {
    title: "日程調整をサクッと",
    description:
      "候補日を共有して、参加メンバーの都合を一覧で確認。旅行日程を素早く決められます。",
  },
  {
    title: "目的地とアイデアを集約",
    description:
      "行きたい場所ややりたいことを投稿して、みんなで投票。合意形成がスムーズになります。",
  },
  {
    title: "旅程管理と精算を一体化",
    description:
      "当日のスケジュールや費用をまとめて管理。あとから見返しても分かりやすい記録を残せます。",
  },
] as const;

const quickSteps = [
  "アカウントを作成して、旅行グループを作る",
  "家族や友だちを招待し、候補日・目的地を共有する",
  "旅程と費用を管理しながら、当日の運営をスムーズに進める",
] as const;

type PromoPageContentProps = {
  autoRedirectOnAuth?: boolean;
};

export function PromoPageContent({
  autoRedirectOnAuth = true,
}: PromoPageContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14">
      <section className="rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900 sm:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
            家族旅行・キャンプの計画をひとつに
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Trip Park で、準備から当日運営まで迷わない
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-base">
            日程調整、目的地の相談、旅程管理、費用精算をひとつの場所で。
            メンバー全員が「今どこまで決まったか」をすぐに把握できます。
          </p>
          <HomeLandingActions autoRedirectOnAuth={autoRedirectOnAuth} />
          <FirebaseEnvHint />
        </div>
      </section>

      <section aria-labelledby="features">
        <h2
          id="features"
          className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl"
        >
          Trip Park でできること
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            はじめ方は 3 ステップ
          </h2>
          <ol className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
            {quickSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-900 dark:bg-teal-900/50 dark:text-teal-100">
                  {index + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            こんなときに便利
          </h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            <li>・家族旅行の予定が毎回メッセージで流れてしまう</li>
            <li>・キャンプの持ち物や役割分担を整理したい</li>
            <li>・立替精算をあとから追うのが大変</li>
          </ul>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
            Trip Park なら、計画に必要な情報を一画面で確認しやすく保てます。
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          次の旅行計画を、今すぐ始めましょう
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          アカウント作成は数分。グループを作ればすぐにメンバー招待ができます。
        </p>
        <div className="mt-4 flex justify-center">
          <HomeLandingActions autoRedirectOnAuth={autoRedirectOnAuth} />
        </div>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Parkシリーズ全体を見る:{" "}
          <Link
            href="/portal"
            className="font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
          >
            公式ポータル
          </Link>
        </p>
      </section>
    </div>
  );
}
