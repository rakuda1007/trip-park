import { AuthGuard } from "@/components/auth-guard";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "旅行を開く",
};

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardHome />
    </AuthGuard>
  );
}
