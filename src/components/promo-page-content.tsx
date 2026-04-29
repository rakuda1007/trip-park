import Link from "next/link";
import Image from "next/image";
import { FirebaseEnvHint } from "@/components/firebase-env-hint";
import { SmartCtaLink } from "@/components/smart-cta-link";

type PromoPageContentProps = {
  autoRedirectOnAuth?: boolean;
};

export function PromoPageContent({
  autoRedirectOnAuth: _autoRedirectOnAuth = true,
}: PromoPageContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 bg-white px-4 py-8 sm:px-6 sm:py-12">
      <section className="rounded-3xl border border-zinc-200 bg-zinc-100 p-3 shadow-sm sm:p-4">
        <div className="relative min-h-[440px] overflow-hidden rounded-2xl sm:min-h-[520px]">
          <Image
            src="/top2_s.jpg"
            alt="自然に囲まれた開放的なキャンプサイト"
            fill
            sizes="(max-width: 768px) 100vw, 1100px"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-2xl px-6 text-white sm:px-10">
              <p className="text-sm font-semibold tracking-wide text-sky-100">
                TRIP PARK PORTAL
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
                「しおり」を作る時間から、旅はもう始まっている。
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-zinc-100 sm:text-base">
                日程調整、行き先の投票、旅費の精算まで。
                <br />
                グループ旅行の「ちょっと面倒」を、すべてトリップパークが引き受けます。
              </p>
              <div className="mt-6">
                <SmartCtaLink className="inline-flex rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600">
                  今すぐ旅を計画する（無料）
                </SmartCtaLink>
              </div>
            </div>
          </div>
        </div>
        <FirebaseEnvHint />
      </section>

      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <Image
            src="/plan_s.jpg"
            alt="日程と投票をイメージした計画画面"
            width={640}
            height={427}
            className="h-full w-full object-cover"
          />
        </div>
        <article>
          <p className="text-sm font-semibold text-orange-600">特徴 01</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            多数決も、日程調整も、一瞬。
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-700 sm:text-base">
            行き先で揉めることはもうありません。候補地を登録して、みんなで「投票」。
            一番人気のスポットが自動で旅程に組み込まれます。
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700">
            <li>✓ 誰がいつ空いているか、パッと集計</li>
            <li>✓ 候補地へのコメント機能で盛り上がる</li>
          </ul>
        </article>
      </section>

      <section className="grid items-center gap-8 lg:grid-cols-2">
        <article>
          <p className="text-sm font-semibold text-orange-600">特徴 02</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            買い出し分担で、当日の連携もスムーズ。
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-700 sm:text-base">
            「誰が何を持ってくるか」を世帯ごとに割り当てて、購入チェックまで一画面で共有。
            旅行中の連絡ロスを減らし、現地での合流や準備をスムーズに進められます。
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700">
            <li>✓ 未割当の項目がすぐ分かるから、役割漏れを防止</li>
            <li>✓ 購入済みチェックで「どこまで済んだか」を全員で共有</li>
          </ul>
        </article>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <Image
            src="/shoppinglist_s.jpg"
            alt="買い出しリストを想起させる食材写真"
            width={640}
            height={427}
            className="h-full w-full object-cover"
          />
        </div>
      </section>

      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <Image
            src="/money_s.jpg"
            alt="電卓とお金で精算をイメージした写真"
            width={640}
            height={427}
            className="h-full w-full object-cover"
          />
        </div>
        <article>
          <p className="text-sm font-semibold text-orange-600">特徴 03</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            「誰が払ったっけ？」をゼロに。
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-700 sm:text-base">
            旅行中の支払いをその場で入力。最後にボタンを押すだけで、複雑な貸し借りも一瞬で計算完了。
            精算の煩わしさから解放されて、最後まで笑顔の旅を。
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700">
            <li>✓ 外貨入力や、特定の人を除いた割り勘にも対応</li>
            <li>✓ 立て替え履歴が残るから後から見返せる</li>
          </ul>
        </article>
      </section>

      <section className="rounded-3xl bg-zinc-50 p-6 text-center sm:p-10">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
          旅を 120% 楽しむための必須デバイスへ
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-700 sm:text-base">
          Trip Park は記録アプリではありません。
          計画の迷いも、当日の連携も、最後の精算もつながるから、旅行そのものに集中できます。
        </p>
        <div className="mt-6">
          <SmartCtaLink className="inline-flex rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600">
            今すぐ旅を計画する（無料）
          </SmartCtaLink>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Parkシリーズ全体を見る:{" "}
          <Link href="/portal" className="font-medium text-sky-700 underline-offset-2 hover:underline">
            公式ポータル
          </Link>
        </p>
      </section>
    </div>
  );
}
