"use client";

import { updatePlanShape } from "@/lib/firestore/groups";
import {
  PLAN_SHAPE_OPTIONS,
  defaultsForCreate,
  labelsForShape,
  resolvePlanShape,
} from "@/lib/plan-shape";
import type { GroupDoc, PlanShape } from "@/types/group";
import { VisibilityBadge } from "@/components/visibility-badge";
import { useState } from "react";

export function PlanShapeSettings({
  groupId,
  group,
  onUpdated,
}: {
  groupId: string;
  group: GroupDoc;
  onUpdated?: (next: GroupDoc) => void;
}) {
  const current = resolvePlanShape(group);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(next: PlanShape) {
    if (next === current || busy) return;
    const opt = PLAN_SHAPE_OPTIONS.find((o) => o.value === next);
    const ok = window.confirm(
      `予定の形を「${opt?.title ?? next}」に変更しますか？\n\n${opt?.convertHint ?? ""}\n登録済みのデータは消えません。`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await updatePlanShape(groupId, next);
      const { placeMode } = defaultsForCreate(next);
      onUpdated?.({
        ...group,
        planShape: next,
        placeMode,
      });
    } catch (e) {
      const msg =
        e && typeof e === "object" && "code" in e
          ? `${String((e as { code?: string }).code ?? "")}: ${
              e instanceof Error ? e.message : "変更に失敗しました"
            }`
          : e instanceof Error
            ? e.message
            : "変更に失敗しました";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          予定の形
        </h2>
        <VisibilityBadge kind="admin" />
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        いまは「{labelsForShape(current).shape}」です。旅行の中止後に飲み会だけにする、精算だけに絞る、などに切り替えられます。
      </p>
      <div className="mt-3 grid gap-2">
        {PLAN_SHAPE_OPTIONS.map((opt) => {
          const selected = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={busy || selected}
              onClick={() => void handleSelect(opt.value)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                selected
                  ? "border-teal-600 bg-teal-50/90 dark:border-teal-500 dark:bg-teal-950/40"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
              }`}
            >
              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {opt.title}
                {selected ? (
                  <span className="ml-2 text-xs font-normal text-teal-800 dark:text-teal-300">
                    （現在）
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
