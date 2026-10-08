import { AuthGuard } from "@/components/auth-guard";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import type { Metadata } from "next";

/** サイレント振り分け用。空状態以外は画面として見せない */
export const metadata: Metadata = {
  title: "旅行を開く",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <AuthGuard loadingLabel="旅行を開いています…">
      <DashboardHome />
    </AuthGuard>
  );
}
