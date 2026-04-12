"use client";

import { useAuth } from "@/contexts/auth-context";
import { deleteGroup, listMyGroups } from "@/lib/firestore/groups";
import type { UserGroupRefDoc } from "@/types/group";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type GroupItem = { groupId: string; data: UserGroupRefDoc };

/** YYYY-MM-DD 形式の今日の日付（ローカル） */
function getTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type GroupSection = "active" | "upcoming" | "undecided" | "past";

function classifyGroup(item: GroupItem, today: string): GroupSection {
  const { tripStartDate, tripEndDate } = item.data;
  if (!tripStartDate) return "undecided";
  const end = tripEndDate ?? tripStartDate;
  if (end < today) return "past";
  if (tripStartDate <= today && today <= end) return "active";
  return "upcoming";
}

function formatDateRange(start: string, end?: string | null): string {
  const ps = start.split("-").map(Number);
  if (ps.length !== 3 || ps.some(Number.isNaN)) return start;
  const [sy, sm, sd] = ps;

  if (!end || end === start) {
    return `${sy}年${sm}月${sd}日`;
  }
  const pe = end.split("-").map(Number);
  if (pe.length !== 3 || pe.some(Number.isNaN)) return `${start} – ${end}`;
  const [ey, em, ed] = pe;
  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}日〜${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日〜${em}月${ed}日`;
  return `${sy}年${sm}月${sd}日〜${ey}年${em}月${ed}日`;
}

function daysUntil(isoDate: string, today: string): number {
  const t = new Date(today);
  const d = new Date(isoDate);
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

function RoleBadge({ role }: { role: UserGroupRefDoc["role"] }) {
  if (role === "owner")
    return (
      <span className="ml-2 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        オーナー
      </span>
    );
  if (role === "admin")
    return (
      <span className="ml-2 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        管理者
      </span>
    );
  return null;
}

function GroupCard({
  groupId,
  data,
  today,
  highlight = false,
  onDelete,
}: {
  groupId: string;
  data: UserGroupRefDoc;
  today: string;
  highlight?: boolean;
  onDelete?: () => void;
}) {
  const { tripStartDate, tripEndDate } = data;
  const dateLabel = tripStartDate
    ? formatDateRange(tripStartDate, tripEndDate)
    : null;
  const section = classifyGroup({ groupId, data }, today);

  const daysLabel = (() => {
    if (section === "upcoming" && tripStartDate) {
      const n = daysUntil(tripStartDate, today);
      if (n === 0) return "今日出発";
      if (n === 1) return "明日出発";
      return `あと ${n} 日`;
    }
    if (section === "active") return "旅行中";
    return null;
  })();

  return (
    <div
      className={`flex items-stretch rounded-lg border shadow-sm transition ${
        highlight
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
      }`}
    >
      <Link
        href={`/groups/${groupId}`}
        className={`flex-1 px-4 py-3 transition ${
          highlight
            ? "hover:border-emerald-400 dark:hover:border-emerald-600"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
        } rounded-l-lg`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {data.groupName}
            <RoleBadge role={data.role} />
          </span>
          {daysLabel ? (
            <span
              className={`text-xs font-semibold ${
                section === "active"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-blue-700 dark:text-blue-400"
              }`}
            >
              {daysLabel}
            </span>
          ) : null}
        </div>
        {dateLabel ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {dateLabel}
          </p>
        ) : null}
      </Link>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center border-l border-zinc-200 px-3 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:hover:bg-red-950/30 dark:hover:text-red-400 rounded-r-lg"
          title="旅行を削除"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
      {children}
    </h2>
  );
}

export function GroupsClient() {
  const { user } = useAuth();
  const [items, setItems] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listMyGroups(user.uid);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (groupId: string, groupName: string) => {
      if (!user) return;
      if (!window.confirm(`「${groupName}」を削除しますか？\nメンバー・日程・旅程など全てのデータが削除されます。この操作は元に戻せません。`)) return;
      setDeletingId(groupId);
      setError(null);
      try {
        await deleteGroup(user.uid, groupId);
        setItems((prev) => prev.filter((x) => x.groupId !== groupId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました");
      } finally {
        setDeletingId(null);
      }
    },
    [user],
  );

  if (!user) return null;

  const today = getTodayISO();

  const active = items.filter((x) => classifyGroup(x, today) === "active");
  const upcoming = items
    .filter((x) => classifyGroup(x, today) === "upcoming")
    .sort((a, b) => (a.data.tripStartDate ?? "").localeCompare(b.data.tripStartDate ?? ""));
  const undecided = items.filter((x) => classifyGroup(x, today) === "undecided");
  const past = items
    .filter((x) => classifyGroup(x, today) === "past")
    .sort((a, b) =>
      (b.data.tripEndDate ?? b.data.tripStartDate ?? "").localeCompare(
        a.data.tripEndDate ?? a.data.tripStartDate ?? "",
      ),
    );

  // 最も直近の旅行を一番上にハイライト表示
  const highlight: GroupItem | null =
    active[0] ?? upcoming[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          旅行一覧
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/groups/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            旅行を作成
          </Link>
          <Link
            href="/join"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            招待コードで参加
          </Link>
        </div>
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        旅行ごとの共有スペースです。旅行を作成して招待リンクを共有すると、メンバーが参加できます。
      </p>

      {error ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          まだ旅行がありません。旅行を作成するか、招待リンクから参加してください。
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {/* 直近グループのハイライト */}
          {highlight ? (
            <div>
              <SectionHeading>
                {active.length > 0 ? "現在の旅行" : "直近の旅行"}
              </SectionHeading>
              <GroupCard
                groupId={highlight.groupId}
                data={highlight.data}
                today={today}
                highlight
                onDelete={
                  highlight.data.role === "owner"
                    ? () => handleDelete(highlight.groupId, highlight.data.groupName)
                    : undefined
                }
              />
              {deletingId === highlight.groupId && (
                <p className="mt-1 text-xs text-zinc-500">削除中…</p>
              )}
            </div>
          ) : null}

          {/* 旅行中（ハイライトと重複しない残り） */}
          {active.length > 1 ? (
            <div>
              <SectionHeading>旅行中</SectionHeading>
              <ul className="space-y-3">
                {active.slice(1).map(({ groupId, data }) => (
                  <li key={groupId}>
                    <GroupCard
                      groupId={groupId}
                      data={data}
                      today={today}
                      onDelete={
                        data.role === "owner"
                          ? () => handleDelete(groupId, data.groupName)
                          : undefined
                      }
                    />
                    {deletingId === groupId && (
                      <p className="mt-1 text-xs text-zinc-500">削除中…</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 今後の旅行（ハイライトと重複しない残り） */}
          {upcoming.length > (highlight && active.length === 0 ? 1 : 0) ? (
            <div>
              <SectionHeading>今後の旅行</SectionHeading>
              <ul className="space-y-3">
                {upcoming
                  .slice(highlight && active.length === 0 ? 1 : 0)
                  .map(({ groupId, data }) => (
                    <li key={groupId}>
                      <GroupCard
                        groupId={groupId}
                        data={data}
                        today={today}
                        onDelete={
                          data.role === "owner"
                            ? () => handleDelete(groupId, data.groupName)
                            : undefined
                        }
                      />
                      {deletingId === groupId && (
                        <p className="mt-1 text-xs text-zinc-500">削除中…</p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {/* 日程未定 */}
          {undecided.length > 0 ? (
            <div>
              <SectionHeading>日程未定</SectionHeading>
              <ul className="space-y-3">
                {undecided.map(({ groupId, data }) => (
                  <li key={groupId}>
                    <GroupCard
                      groupId={groupId}
                      data={data}
                      today={today}
                      onDelete={
                        data.role === "owner"
                          ? () => handleDelete(groupId, data.groupName)
                          : undefined
                      }
                    />
                    {deletingId === groupId && (
                      <p className="mt-1 text-xs text-zinc-500">削除中…</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 過去の旅行（折りたたみ） */}
          {past.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setPastOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <span
                  className={`inline-block transition-transform ${pastOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                過去の旅行（{past.length}件）
              </button>
              {pastOpen ? (
                <ul className="mt-3 space-y-3">
                  {past.map(({ groupId, data }) => (
                    <li key={groupId}>
                      <GroupCard
                        groupId={groupId}
                        data={data}
                        today={today}
                        onDelete={
                          data.role === "owner"
                            ? () => handleDelete(groupId, data.groupName)
                            : undefined
                        }
                      />
                      {deletingId === groupId && (
                        <p className="mt-1 text-xs text-zinc-500">削除中…</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
