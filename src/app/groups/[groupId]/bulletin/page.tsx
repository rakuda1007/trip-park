import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { BulletinClient } from "./bulletin-client";

export const metadata: Metadata = {
  title: "連絡",
};

export default function GroupBulletinPage() {
  return (
    <AuthGuard>
      <BulletinClient />
    </AuthGuard>
  );
}
