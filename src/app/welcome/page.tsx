import type { Metadata } from "next";
import { Suspense } from "react";
import { WelcomeClient } from "./welcome-client";

export const metadata: Metadata = {
  title: "招待を受け取りました",
};

function WelcomeFallback() {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <p className="text-sm text-zinc-500">読み込み中…</p>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<WelcomeFallback />}>
      <WelcomeClient />
    </Suspense>
  );
}
