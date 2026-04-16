import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { BulletinClient } from "./bulletin-client";

export const metadata: Metadata = {
  title: "トピック",
};

export default function GroupBulletinPage() {
  return (
    <AuthGuard>
      <BulletinClient />
    </AuthGuard>
  );
}
