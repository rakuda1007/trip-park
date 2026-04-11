import { AuthGuard } from "@/components/auth-guard";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ダッシュボード",
};

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardHome />
    </AuthGuard>
  );
}
