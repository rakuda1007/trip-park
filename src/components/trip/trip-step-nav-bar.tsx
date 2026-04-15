"use client";

import { getGroup } from "@/lib/firestore/groups";
import { listTripRoutes } from "@/lib/firestore/trip";
import type { GroupDoc } from "@/types/group";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** layout.tsx から直接使えるラッパー（groupId を useParams で取得） */
export function TripStepNavBarWrapper() {
  const params = useParams();
  const groupId = params?.groupId as string | undefined;
  if (!groupId) return null;
  return <TripStepNavBar groupId={groupId} />;
}

function getActiveStep(pathname: string, groupId: string): string | null {
  if (pathname === `/groups/${groupId}`) return null; // detail page: no active step
  if (pathname === `/groups/${groupId}/schedule`) return "schedule";
  if (pathname.startsWith(`/groups/${groupId}/destination-votes`)) return "destination";
  if (pathname.startsWith(`/groups/${groupId}/trip`)) return "trip";
  if (pathname.startsWith(`/groups/${groupId}/expenses`)) return "expenses";
  return null;
}

function isGroupPage(pathname: string, groupId: string): boolean {
  return pathname.startsWith(`/groups/${groupId}`);
}

export function TripStepNavBar({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [hasTripRoutes, setHasTripRoutes] = useState(false);

  useEffect(() => {
    getGroup(groupId).then(setGroup).catch(() => {});
  }, [groupId]);

  useEffect(() => {
    listTripRoutes(groupId)
      .then((r) => setHasTripRoutes(r.length > 0))
      .catch(() => setHasTripRoutes(false));
  }, [groupId, pathname]);

  // グループ配下のページ以外では非表示
  if (!isGroupPage(pathname, groupId)) return null;

  const activeStep = getActiveStep(pathname, groupId);

  const datesDone = !!group?.tripStartDate;
  const destDone = !!group?.destination;
  const status = group?.status ?? "planning";
  /** 旅程ステップの完了は「旅程ページに1件以上の日プランがある」で判定（旅行フェーズとは独立） */
  const itinDone = hasTripRoutes;
  const settleDone = status === "completed";

  const steps = [
    {
      key: "schedule",
      label: "日程",
      done: datesDone,
      href: `/groups/${groupId}/schedule`,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      key: "destination",
      label: "目的地",
      done: destDone,
      href: `/groups/${groupId}/destination-votes`,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .953.524l.004.002.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      key: "trip",
      label: "旅程",
      done: itinDone,
      href: `/groups/${groupId}/trip`,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M8.157 2.176a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.25v10.877a.75.75 0 0 0 1.29.523 2.25 2.25 0 0 1 3.162-.044l.093.09a2.25 2.25 0 0 0 2.81.197l.042-.028a2.25 2.25 0 0 1 2.51 0l.042.028a2.25 2.25 0 0 0 2.81-.197l.093-.09a2.25 2.25 0 0 1 3.162.044.75.75 0 0 0 1.29-.523V5.25a1.5 1.5 0 0 0-.926-1.384l-4.084-1.69a1.5 1.5 0 0 0-1.147 0l-1.023.423a.75.75 0 0 1-.573 0L8.157 2.176Z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      key: "expenses",
      label: "精算",
      done: settleDone,
      href: `/groups/${groupId}/expenses`,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M9.99 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4 10a6 6 0 0 1 10.607-3.87l-8.477 8.477A6 6 0 0 1 4 10Zm6 6a5.966 5.966 0 0 1-3.607-1.217l8.477-8.477A6 6 0 0 1 16 10a6 6 0 0 1-6 6Z" clipRule="evenodd" />
        </svg>
      ),
    },
  ];

  return (
    <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex items-center gap-0.5 overflow-x-auto py-2">
          {/* ステップ */}
          {steps.map((step, idx) => {
            const isActive = step.key === activeStep;
            return (
              <div key={step.key} className="flex shrink-0 items-center">
                {idx > 0 && (
                  <div className={`mx-1 h-px w-3 shrink-0 ${
                    step.done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-zinc-200 dark:bg-zinc-700"
                  }`} />
                )}
                <Link
                  href={step.href}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : step.done
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {step.done && !isActive ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    step.icon
                  )}
                  {step.label}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
