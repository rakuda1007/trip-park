"use client";

import { useAuth } from "@/contexts/auth-context";
import { listMyGroups } from "@/lib/firestore/groups";
import { clearLastTripId, loadLastTripId, saveLastTripId } from "@/lib/last-trip";
import type { UserGroupRefDoc } from "@/types/group";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type TripItem = { groupId: string; data: UserGroupRefDoc };

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type SectionKey = "active" | "upcoming" | "undecided" | "past";

function classifyTrip(item: TripItem): SectionKey {
  const today = getTodayISO();
  const { tripStartDate, tripEndDate } = item.data;
  if (!tripStartDate) return "undecided";
  if (tripEndDate && tripEndDate < today) return "past";
  if (tripStartDate <= today) return "active";
  return "upcoming";
}

function formatDateShort(start: string, end?: string | null): string {
  const [, sm, sd] = start.split("-").map(Number);
  if (!end || end === start) return `${sm}/${sd}`;
  const [, em, ed] = end.split("-").map(Number);
  if (sm === em) return `${sm}/${sd}〜${ed}`;
  return `${sm}/${sd}〜${em}/${ed}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date(getTodayISO());
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** `/groups/new` などは旅行IDとして扱わない（AppHeader と同一） */
const RESERVED_GROUP_PATH_SEGMENTS = new Set(["new"]);

function parseCurrentGroupIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/groups\/([^/]+)/);
  const seg = m?.[1];
  if (!seg || RESERVED_GROUP_PATH_SEGMENTS.has(seg)) return undefined;
  return seg;
}

export function TripSelector() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const currentGroupId = parseCurrentGroupIdFromPath(pathname);

  const [trips, setTrips] = useState<TripItem[]>([]);
  const [open, setOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<TripItem | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadTrips = useCallback(async () => {
    if (!user) return;
    try {
      const list = await listMyGroups(user.uid);
      setTrips(list);
      if (currentGroupId) {
        const found = list.find((t) => t.groupId === currentGroupId);
        setCurrentTrip(found ?? null);
      } else {
        const lastId = loadLastTripId(user.uid);
        if (lastId) {
          const found = list.find((t) => t.groupId === lastId);
          if (found) {
            setCurrentTrip(found);
          } else {
            // 一覧に無い（削除済み等）の ID が残っているとヘッダーと画面が食い違うため消す
            clearLastTripId(user.uid);
            setCurrentTrip(null);
          }
        } else {
          setCurrentTrip(null);
        }
      }
    } catch {
      // ignore
    }
  }, [user, currentGroupId]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  // クリック外で閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(trip: TripItem) {
    if (user) saveLastTripId(user.uid, trip.groupId);
    setCurrentTrip(trip);
    setOpen(false);
    router.push(`/groups/${trip.groupId}`);
  }

  if (!user) return null;

  // セクション分類
  const sections: { key: SectionKey; label: string; items: TripItem[] }[] = [
    { key: "active", label: "旅行中", items: [] },
    { key: "upcoming", label: "今後の旅行", items: [] },
    { key: "undecided", label: "日程未定", items: [] },
    { key: "past", label: "過去の旅行", items: [] },
  ];
  for (const t of trips) {
    const key = classifyTrip(t);
    sections.find((s) => s.key === key)?.items.push(t);
  }
  // 今後は直近順にソート
  sections.find((s) => s.key === "upcoming")!.items.sort(
    (a, b) => (a.data.tripStartDate ?? "").localeCompare(b.data.tripStartDate ?? ""),
  );
  // 過去は直近順にソート（降順）
  sections.find((s) => s.key === "past")!.items.sort(
    (a, b) => (b.data.tripStartDate ?? "").localeCompare(a.data.tripStartDate ?? ""),
  );

  const hasTrips = trips.length > 0;
  const displayName = currentTrip?.data.groupName ?? "旅行を選択";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:gap-1.5 sm:px-3"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 max-w-[5rem] truncate sm:max-w-[120px] md:max-w-[180px]">
          {displayName}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {!hasTrips ? (
            <div className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              旅行がありません
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {sections
                .filter((s) => s.items.length > 0)
                .map((section) => (
                  <div key={section.key}>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {section.label}
                    </div>
                    {section.items.map((trip) => {
                      const isActive = trip.groupId === currentGroupId;
                      const days =
                        trip.data.tripStartDate && section.key === "upcoming"
                          ? daysUntil(trip.data.tripStartDate)
                          : null;
                      return (
                        <button
                          key={trip.groupId}
                          type="button"
                          onClick={() => handleSelect(trip)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${isActive ? "bg-zinc-100 font-medium dark:bg-zinc-800" : ""}`}
                        >
                          <span className="truncate">{trip.data.groupName}</span>
                          <span className="ml-2 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                            {trip.data.tripStartDate
                              ? formatDateShort(
                                  trip.data.tripStartDate,
                                  trip.data.tripEndDate,
                                )
                              : ""}
                            {days !== null && days > 0 ? (
                              <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                {days}日後
                              </span>
                            ) : null}
                            {days !== null && days === 0 ? (
                              <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                今日
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}
          <div className="border-t border-zinc-100 p-2 dark:border-zinc-800">
            <Link
              href="/groups/new"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              旅行を作成
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
