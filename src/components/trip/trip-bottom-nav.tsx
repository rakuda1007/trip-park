"use client";

import { useGroupRouteId } from "@/contexts/group-route-context";
import { listDestinationPolls } from "@/lib/firestore/destination-votes";
import { getGroup } from "@/lib/firestore/groups";
import { listTripRoutes } from "@/lib/firestore/trip";
import { resolveNextPlanPath } from "@/lib/trip-workflow-all-complete";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type MoreKey = "sharing" | "expenses" | "families" | "admin";

/**
 * モバイル向けボトムナビ。
 * ホーム / 計画 / 連絡 / もっと（買い出し・精算・世帯など）
 */
export function TripBottomNav() {
  const groupId = useGroupRouteId();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [planHref, setPlanHref] = useState(`/groups/${groupId}/schedule`);

  const homeHref = `/groups/${groupId}`;
  const contactHref = `/groups/${groupId}/bulletin`;

  const isHome =
    pathname === homeHref || pathname === `${homeHref}/`;
  const isPlan =
    pathname.startsWith(`${homeHref}/schedule`) ||
    pathname.startsWith(`${homeHref}/destination-votes`) ||
    pathname.startsWith(`${homeHref}/trip`);
  const isContact = pathname.startsWith(`${homeHref}/bulletin`);
  const isMore =
    pathname.startsWith(`${homeHref}/sharing`) ||
    pathname.startsWith(`${homeHref}/expenses`) ||
    pathname.startsWith(`${homeHref}/families`) ||
    pathname.startsWith(`${homeHref}/admin`);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function onOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [moreOpen]);

  useEffect(() => {
    let cancelled = false;
    setPlanHref(`/groups/${groupId}/schedule`);
    void (async () => {
      try {
        const group = await getGroup(groupId);
        if (cancelled || !group) return;
        const [polls, routes] = await Promise.all([
          listDestinationPolls(groupId),
          listTripRoutes(groupId),
        ]);
        if (cancelled) return;
        setPlanHref(resolveNextPlanPath(groupId, group, polls, routes));
      } catch {
        if (!cancelled) setPlanHref(`/groups/${groupId}/schedule`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, pathname]);

  const moreItems: { key: MoreKey; label: string; href: string }[] = [
    { key: "sharing", label: "買い出し", href: `${homeHref}/sharing` },
    {
      key: "expenses",
      label: "支出・精算",
      href: `${homeHref}/expenses`,
    },
    { key: "families", label: "参加世帯", href: `${homeHref}/families` },
  ];

  const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium ${
      active
        ? "text-teal-800 dark:text-teal-300"
        : "text-zinc-500 dark:text-zinc-400"
    }`;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
      aria-label="旅行メニュー"
    >
      <div className="relative mx-auto flex max-w-3xl items-stretch">
        <Link href={homeHref} className={itemClass(isHome)} aria-current={isHome ? "page" : undefined}>
          <HomeIcon />
          ホーム
        </Link>
        <Link href={planHref} className={itemClass(isPlan && !isHome)} aria-current={isPlan && !isHome ? "page" : undefined}>
          <PlanIcon />
          計画
        </Link>
        <Link
          href={contactHref}
          className={itemClass(isContact)}
          aria-current={isContact ? "page" : undefined}
        >
          <ContactIcon />
          連絡
        </Link>
        <div ref={moreRef} className="relative flex min-w-0 flex-1">
          <button
            type="button"
            className={`${itemClass(isMore || moreOpen)} w-full`}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreIcon />
            もっと
          </button>
          {moreOpen ? (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+0.35rem)] right-2 min-w-[10rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            >
              {moreItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  role="menuitem"
                  className="block px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => setMoreOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
    </svg>
  );
}

function PlanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5.414l-2.707 2.707A1 1 0 0 1 1 17V5Zm3 1a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H5Zm0 4a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H5Z" clipRule="evenodd" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM8.5 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM15.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  );
}
