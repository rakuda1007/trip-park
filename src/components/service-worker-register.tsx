"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // 開発中は SW が古いアセットを返して挙動確認を邪魔しやすいため無効化する
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
          void reg.unregister();
        });
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("SW registration failed:", err));
    // 更新時の強制 reload は起動直後のチラつきの原因になるため行わない。
    // sw.js 側の skipWaiting + clients.claim で次回ナビ以降に新 SW が効く。
  }, []);

  return null;
}
