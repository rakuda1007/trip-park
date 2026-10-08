import { PromoPageContent } from "@/components/promo-page-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trip Park",
  description:
    "グループ旅行の計画・連絡・精算アプリ。ログイン済みの場合はアプリへ入ります。",
};

/** アプリ入口（ログイン済みは /dashboard へ自動遷移） */
export default function Home() {
  return <PromoPageContent autoRedirectOnAuth />;
}
