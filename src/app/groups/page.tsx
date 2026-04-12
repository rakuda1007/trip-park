import { AuthGuard } from "@/components/auth-guard";
import { GroupsClient } from "./groups-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "旅行一覧",
};

export default function GroupsPage() {
  return (
    <AuthGuard>
      <GroupsClient />
    </AuthGuard>
  );
}
