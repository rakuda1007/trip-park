"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  createHousehold,
  deleteHousehold,
  listHouseholds,
  updateHousehold,
  type HouseholdItem,
} from "@/lib/firestore/households";
import { useCallback, useEffect, useState } from "react";

type FormState = {
  name: string;
  defaultAdultCount: string;
  defaultChildCount: string;
  defaultChildRatio: string;
};

const emptyForm = (): FormState => ({
  name: "",
  defaultAdultCount: "1",
  defaultChildCount: "0",
  defaultChildRatio: "0.5",
});

function toParams(f: FormState) {
  return {
    name: f.name.trim(),
    defaultAdultCount: Math.max(1, parseInt(f.defaultAdultCount, 10) || 1),
    defaultChildCount: Math.max(0, parseInt(f.defaultChildCount, 10) || 0),
    defaultChildRatio: Math.min(
      1,
      Math.max(0, parseFloat(f.defaultChildRatio) || 0.5),
    ),
    memberUserIds: [] as string[],
  };
}

function HouseholdForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          世帯名
          <span className="ml-1 text-xs text-zinc-400">（精算時の表示名）</span>
        </label>
        <input
          type="text"
          required
          value={form.name}
          onChange={field("name")}
          placeholder="例: 奥田家"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            大人の人数
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={form.defaultAdultCount}
            onChange={field("defaultAdultCount")}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            子供の人数
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={form.defaultChildCount}
            onChange={field("defaultChildCount")}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            子供の負担比率
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={form.defaultChildRatio}
            onChange={field("defaultChildRatio")}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <p className="mt-0.5 text-[10px] text-zinc-400">大人=1.0</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

function HouseholdCard({
  item,
  onEdit,
  onDelete,
}: {
  item: HouseholdItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data } = item;
  const adultLabel = `大人 ${data.defaultAdultCount}人`;
  const childLabel =
    data.defaultChildCount > 0
      ? `・子供 ${data.defaultChildCount}人（×${data.defaultChildRatio}）`
      : "";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{data.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {adultLabel}
            {childLabel}
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-xs">
          <button
            type="button"
            onClick={onEdit}
            className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            編集
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

export function HouseholdsClient() {
  const { user } = useAuth();
  const [items, setItems] = useState<HouseholdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listHouseholds(user.uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(form: FormState) {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await createHousehold(user.uid, toParams(form));
      setShowNew(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: string, form: FormState) {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await updateHousehold(user.uid, id, toParams(form));
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!user) return;
    if (!confirm(`「${name}」を削除しますか？旅行への影響はありません。`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteHousehold(user.uid, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div>
      {error ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && !showNew ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
              世帯マスタがまだありません。「追加する」から登録してください。
            </p>
          ) : null}

          {items.map((item) =>
            editingId === item.id ? (
              <div
                key={item.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900/60"
              >
                <HouseholdForm
                  initial={{
                    name: item.data.name,
                    defaultAdultCount: String(item.data.defaultAdultCount),
                    defaultChildCount: String(item.data.defaultChildCount),
                    defaultChildRatio: String(item.data.defaultChildRatio),
                  }}
                  onSave={(form) => handleUpdate(item.id, form)}
                  onCancel={() => setEditingId(null)}
                  busy={busy}
                />
              </div>
            ) : (
              <HouseholdCard
                key={item.id}
                item={item}
                onEdit={() => setEditingId(item.id)}
                onDelete={() => handleDelete(item.id, item.data.name)}
              />
            ),
          )}

          {showNew ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900/60">
              <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                新しい世帯を追加
              </p>
              <HouseholdForm
                initial={emptyForm()}
                onSave={handleCreate}
                onCancel={() => setShowNew(false)}
                busy={busy}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              世帯を追加する
            </button>
          )}
        </div>
      )}
    </div>
  );
}
