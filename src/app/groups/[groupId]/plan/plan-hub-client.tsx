"use client";

import { useGroupRouteId } from "@/contexts/group-route-context";
import { listBulletinTopicsWithReplyCounts } from "@/lib/firestore/bulletin";
import { listDestinationPolls } from "@/lib/firestore/destination-votes";
import { getGroup } from "@/lib/firestore/groups";
import { listTripRoutes } from "@/lib/firestore/trip";
import { isStepVisible, resolvePlanConfig } from "@/lib/plan-shape";
import {
  arePreparationStepsComplete,
  isDestinationStepCompleteForGroup,
  isItineraryCompleteForGroup,
  resolveNextPlanPath,
} from "@/lib/trip-workflow-all-complete";
import type { GroupDoc } from "@/types/group";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type StepCard = {
  key: string;
  label: string;
  href: string;
  done: boolean;
  hint: string;
};

export function PlanHubClient() {
  const groupId = useGroupRouteId();
  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState<
    Awaited<ReturnType<typeof listDestinationPolls>>
  >([]);
  const [routes, setRoutes] = useState<
    Awaited<ReturnType<typeof listTripRoutes>>
  >([]);
  const [recipeTopics, setRecipeTopics] = useState<
    { id: string; title: string; open: boolean }[]
  >([]);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (!g) return;
      const [p, r, topics] = await Promise.all([
        listDestinationPolls(groupId),
        listTripRoutes(groupId),
        listBulletinTopicsWithReplyCounts(groupId).catch(() => []),
      ]);
      setPolls(p);
      setRoutes(r);
      setRecipeTopics(
        topics
          .filter((t) => t.data.category === "recipe_vote")
          .map((t) => ({
            id: t.id,
            title: t.data.title,
            open: !t.data.recipePollResolution,
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const config = useMemo(
    () => (group ? resolvePlanConfig(group, polls.length) : null),
    [group, polls.length],
  );

  const steps: StepCard[] = useMemo(() => {
    if (!group || !config || !groupId) return [];
    const cards: StepCard[] = [];
    const scheduleDone = !!group.tripStartDate?.trim();
    const destDone = isDestinationStepCompleteForGroup(group, polls);
    const itinDone = isItineraryCompleteForGroup(group, routes);
    const settlementDone = (group.status ?? "planning") === "completed";

    if (isStepVisible(config.schedule)) {
      cards.push({
        key: "schedule",
        label: config.labels.schedule,
        href: `/groups/${groupId}/schedule`,
        done: scheduleDone,
        hint: scheduleDone ? "日付が設定済みです" : "候補投票または日付の設定",
      });
    }
    if (isStepVisible(config.place)) {
      cards.push({
        key: "place",
        label: config.labels.place,
        href: `/groups/${groupId}/destination-votes`,
        done: destDone,
        hint:
          config.placeMode === "fixed"
            ? destDone
              ? "登録済みです"
              : "場所を登録してください"
            : destDone
              ? "決定済みです"
              : "投票・決定を進めてください",
      });
    }
    if (isStepVisible(config.itinerary)) {
      cards.push({
        key: "itinerary",
        label: config.labels.itinerary,
        href: `/groups/${groupId}/trip`,
        done: itinDone,
        hint: itinDone
          ? "各日のルートが確認済みです"
          : "各日のルートを埋めて確認済みに",
      });
    }
    cards.push({
      key: "settlement",
      label: config.labels.settlement,
      href: `/groups/${groupId}/expenses?tab=settle`,
      done: settlementDone,
      hint: settlementDone
        ? "精算は完了しています"
        : "支出の記録と精算結果の確認",
    });
    return cards;
  }, [group, config, groupId, polls, routes]);

  const nextHref =
    group && groupId
      ? resolveNextPlanPath(groupId, group, polls, routes)
      : null;
  const prepDone =
    !!group && arePreparationStepsComplete(group, polls, routes);
  const showRecipe =
    !!config && isStepVisible(config.itinerary);

  if (group === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-red-600">旅行が見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm underline">
          旅行一覧へ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← 旅行ホーム
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {config?.planShape === "settle_only" ? "精算の見通し" : "計画の見通し"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {config?.labels.shape}
        で使う工程一覧です。未完了から順に進められます。
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {nextHref && !prepDone ? (
        <div className="mt-5">
          <Link
            href={nextHref}
            className="inline-flex items-center justify-center rounded-lg border-2 border-sky-600/45 bg-sky-50/95 px-4 py-2.5 text-sm font-semibold text-sky-950 shadow-sm transition hover:bg-sky-100/95 dark:border-sky-500/45 dark:bg-sky-950/35 dark:text-sky-50"
          >
            次の未完了工程へ進む
          </Link>
        </div>
      ) : null}

      <ul className="mt-6 space-y-3">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                s.done
                  ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/25"
                  : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {s.label}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {s.hint}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
                  s.done
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
                }`}
              >
                {s.done ? "完了" : "開く"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {showRecipe ? (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            献立・レシピ投票
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            旅程の食事枠とつながる投票です（連絡一覧の主戦場ではありません）。
          </p>
          {recipeTopics.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-zinc-300 px-4 py-4 dark:border-zinc-600">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                まだレシピ投票はありません。
              </p>
              <Link
                href={`/groups/${groupId}/bulletin?new=1&category=recipe_vote`}
                className="mt-2 inline-block text-sm font-medium text-teal-800 underline dark:text-teal-300"
              >
                レシピ投票を作成する
              </Link>
              <span className="mx-2 text-zinc-400">／</span>
              <Link
                href={`/groups/${groupId}/trip`}
                className="inline-block text-sm font-medium text-teal-800 underline dark:text-teal-300"
              >
                旅程から作成
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {recipeTopics.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/groups/${groupId}/bulletin/${t.id}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/50"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {t.title}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {t.open ? "投票中" : "確定済み"}
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`/groups/${groupId}/bulletin?new=1&category=recipe_vote`}
                  className="text-sm font-medium text-teal-800 underline dark:text-teal-300"
                >
                  ＋ 別のレシピ投票を作成
                </Link>
              </li>
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
