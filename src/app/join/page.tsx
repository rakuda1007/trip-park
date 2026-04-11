import { AuthGuard } from "@/components/auth-guard";
import { JoinClient } from "./join-client";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "招待で参加",
};

function JoinFallback() {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <p className="text-sm text-zinc-500">読み込み中…</p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<JoinFallback />}>
        <JoinClient />
      </Suspense>
    </AuthGuard>
  );
}
