import { PromoPageContent } from "@/components/promo-page-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "公式ポータル",
  description:
    "Trip Park の紹介ページ（ログインしてもアプリへ自動遷移しません）。",
};

/**
 * マーケ／紹介用の固定 URL。
 * ログイン済みでも LP を見せたいときに使う（autoRedirect なし）。
 */
export default function PortalPage() {
  return <PromoPageContent autoRedirectOnAuth={false} />;
}
