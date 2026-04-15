import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { SharingClient } from "./sharing-client";

export const metadata: Metadata = {
  title: "買い出し・分担",
};

export default function GroupSharingPage() {
  return (
    <AuthGuard>
      <SharingClient />
    </AuthGuard>
  );
}
