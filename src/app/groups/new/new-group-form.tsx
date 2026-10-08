"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  listCircleMembers,
  listCircles,
  type CircleItem,
} from "@/lib/firestore/circles";
import { createGroup } from "@/lib/firestore/groups";
import { PLAN_SHAPE_OPTIONS } from "@/lib/plan-shape";
import type { PlaceMode, PlanShape } from "@/types/group";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function NewGroupForm() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [planShape, setPlanShape] = useState<PlanShape>("settle_only");
  const [placeMode, setPlaceMode] = useState<PlaceMode>("fixed");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [inviteCircleId, setInviteCircleId] = useState("");
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [circleMemberCount, setCircleMemberCount] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (planShape === "trip") setPlaceMode("vote");
    else if (planShape === "gathering") setPlaceMode("fixed");
    else setPlaceMode("skip");
  }, [planShape]);

  useEffect(() => {
    if (!user) return;
    void listCircles(user.uid)
      .then((list) => {
        setCircles(list);
        const fromQuery = searchParams.get("circle");
        if (fromQuery && list.some((c) => c.id === fromQuery)) {
          setInviteCircleId(fromQuery);
        }
      })
      .catch(() => setCircles([]));
  }, [user, searchParams]);

  useEffect(() => {
    if (!inviteCircleId) {
      setCircleMemberCount(null);
      return;
    }
    let cancelled = false;
    void listCircleMembers(inviteCircleId)
      .then((members) => {
        if (!cancelled) setCircleMemberCount(members.length);
      })
      .catch(() => {
        if (!cancelled) setCircleMemberCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCircleId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const n = name.trim();
    if (!n) {
      setError("名前を入力してください。");
      return;
    }
    if (tripStartDate && tripEndDate && tripEndDate < tripStartDate) {
      setError("終了日は開始日以降にしてください。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const resolvedPlaceMode: PlaceMode =
        planShape === "settle_only"
          ? "skip"
          : planShape === "gathering"
            ? placeMode === "vote"
              ? "vote"
              : "fixed"
            : placeMode === "fixed"
              ? "fixed"
              : "vote";

      const gid = await createGroup(
        user.uid,
        user.displayName,
        n,
        description.trim() || null,
        {
          planShape,
          placeMode: resolvedPlaceMode,
          tripStartDate:
            planShape === "settle_only" ? null : tripStartDate || null,
          tripEndDate:
            planShape === "settle_only"
              ? null
              : tripEndDate || tripStartDate || null,
        },
      );
      const q = new URLSearchParams({ setup: "1" });
      if (inviteCircleId) q.set("circleInvite", inviteCircleId);
      if (planShape === "settle_only") q.set("after", "expenses");
      router.push(`/groups/${gid}/families?${q.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const nameLabel =
    planShape === "settle_only"
      ? "精算の名前（例: 3/10 居酒屋）"
      : planShape === "gathering"
        ? "集まりの名前（例: チーム飲み）"
        : "旅行名（例: 2026年春キャンプ）";

  const showDates = planShape !== "settle_only";
  const showPlaceMode = planShape === "trip" || planShape === "gathering";

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-lg space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          どんな予定ですか？
        </legend>
        <div className="mt-2 grid gap-2">
          {PLAN_SHAPE_OPTIONS.map((opt) => {
            const selected = planShape === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition-colors ${
                  selected
                    ? "border-teal-600 bg-teal-50/80 dark:border-teal-500 dark:bg-teal-950/40"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
                }`}
              >
                <input
                  type="radio"
                  name="planShape"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setPlanShape(opt.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
                    {opt.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="group-name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {nameLabel}
        </label>
        <input
          id="group-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div>
        <label
          htmlFor="group-desc"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          説明（任意）
        </label>
        <textarea
          id="group-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      {showPlaceMode ? (
        <fieldset>
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {planShape === "gathering" ? "お店の決め方" : "目的地の決め方"}
          </legend>
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="placeMode"
                checked={placeMode === "vote"}
                onChange={() => setPlaceMode("vote")}
                className="mt-1"
              />
              <span>
                投票で決める
                <span className="block text-xs text-zinc-500">
                  候補を出してメンバーで選びます
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="placeMode"
                checked={placeMode === "fixed"}
                onChange={() => setPlaceMode("fixed")}
                className="mt-1"
              />
              <span>
                最初から決まっている
                <span className="block text-xs text-zinc-500">
                  投票せず、名前を登録するだけにします
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}

      {showDates ? (
        <div>
          <p className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {planShape === "gathering" ? "日時（任意）" : "旅行日程（任意）"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            後から調整画面でも設定できます。
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              {planShape === "gathering" ? "開催日" : "開始日"}
              <input
                type="date"
                value={tripStartDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setTripStartDate(v);
                  setTripEndDate((prev) => (!prev || prev < v ? v : prev));
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              終了日
              <input
                type="date"
                value={tripEndDate}
                min={tripStartDate || undefined}
                onChange={(e) => setTripEndDate(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
          日程やお店の登録は不要です。作成後すぐに参加世帯と支出の登録へ進みます。
        </p>
      )}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
        <label
          htmlFor="invite-circle"
          className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
        >
          サークルから招待（任意）
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          作成後に、選んだサークルのメンバーへ招待リンクを共有できます。
        </p>
        {circles.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            まだサークルがありません。{" "}
            <Link
              href="/circles"
              className="font-medium text-emerald-800 underline dark:text-emerald-400"
            >
              サークルを作る
            </Link>
          </p>
        ) : (
          <>
            <select
              id="invite-circle"
              value={inviteCircleId}
              onChange={(e) => setInviteCircleId(e.target.value)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">選ばない</option>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.data.name}
                </option>
              ))}
            </select>
            {inviteCircleId && circleMemberCount != null ? (
              <p className="mt-1.5 text-xs text-zinc-500">
                メンバー {circleMemberCount} 人（作成後に共有画面を出します）
              </p>
            ) : null}
            <Link
              href="/circles"
              className="mt-2 inline-block text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
            >
              サークルを管理する
            </Link>
          </>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {submitting
          ? "作成中…"
          : planShape === "settle_only"
            ? "精算だけ始める"
            : "作成する"}
      </button>
    </form>
  );
}
