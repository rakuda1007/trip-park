import { AuthGuard } from "@/components/auth-guard";
import { GroupDetailClient } from "./group-detail-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "グループ詳細",
};

export default function GroupDetailPage() {
  return (
    <AuthGuard>
      <GroupDetailClient />
    </AuthGuard>
  );
}
