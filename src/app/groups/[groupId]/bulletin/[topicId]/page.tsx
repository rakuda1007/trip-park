import { AuthGuard } from "@/components/auth-guard";
import type { Metadata } from "next";
import { BulletinTopicClient } from "./bulletin-topic-client";

export const metadata: Metadata = {
  title: "トピック",
};

export default function BulletinTopicPage() {
  return (
    <AuthGuard>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <BulletinTopicClient />
      </div>
    </AuthGuard>
  );
}
