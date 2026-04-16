import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { BulletinTopicClient } from "./bulletin-topic-client";

export const metadata: Metadata = {
  title: "トピック",
};

export default function BulletinTopicPage() {
  return (
    <AuthGuard>
      <BulletinTopicClient />
    </AuthGuard>
  );
}
