"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * 測定 ID があるときだけ GA4 タグを読み、ページ表示のたびに page_view を送る。
 * Firebase Analytics SDK は使わない。SDK は環境変数ではなく、
 * Firebase に登録された測定 ID へ送るため。
 */
function ensureGtag(measurementId: string) {
  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag === "function") return;

  window.gtag = function gtag() {
    // gtag.js は arguments オブジェクトをそのまま dataLayer に積む前提
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function FirebaseAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    ensureGtag(MEASUREMENT_ID);
    const path = search ? `${pathname}?${search}` : pathname;
    window.gtag?.("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: path,
      send_to: MEASUREMENT_ID,
    });
  }, [pathname, search]);

  return null;
}
