import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { PlanHubClient } from "./plan-hub-client";

export const metadata: Metadata = {
  title: "計画",
};

export default function GroupPlanPage() {
  return (
    <AuthGuard>
      <PlanHubClient />
    </AuthGuard>
  );
}
