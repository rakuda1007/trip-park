"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  addDestinationCandidate,
  castDestinationVote,
  deleteDestinationCandidate,
  listDestinationCandidates,
  listDestinationVotes,
  updateDestinationCandidate,
  type CandidateItem,
  type VoteItem,
} from "@/lib/firestore/destination-votes";
import { getGroup, updateDestination } from "@/lib/firestore/groups";
import type { DestinationAnswer } from "@/types/destination";
import type { GroupDoc } from "@/types/group";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

const ANSWER_LABELS: Record<DestinationAnswer, string> = {
  first: "ここに行きたい 🙋",
  want: "行きたい 👍",
  reserve: "抑え 🤏",
};


const ANSWER_BAR_COLORS: Record<DestinationAnswer, string> = {
  first: "bg-emerald-400",
  want: "bg-blue-400",
  reserve: "bg-amber-400",
};

function formatCost(n: number): string {
  return `¥${n.toLocaleString()}`;
}

type EditDraft = {
  name: string;
  url: string;
  costPerNight: string;
  description: string;
};

function CandidateForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  initial?: EditDraft;
  onSubmit: (d: EditDraft) => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [costPerNight, setCostPerNight] = useState(initial?.costPerNight ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, url, costPerNight, description });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          目的地名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 九十九里シーサイドオートキャンプ場"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          費用（円）（任意）
        </label>
        <input
          type="number"
          min={0}
          value={costPerNight}
          onChange={(e) => setCostPerNight(e.target.value)}
          placeholder="例: 5000"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          URL（任意）
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          補足（任意）
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="アクセス方法や特徴など"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "保存中…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            キャンセル
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function DestinationVotesClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [votes, setVotes] = useState<VoteItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const [g, c, v] = await Promise.all([
        getGroup(groupId),
        listDestinationCandidates(groupId),
        listDestinationVotes(groupId),
      ]);
      setGroup(g);
      setCandidates(c);
      setVotes(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  async function handleAddCandidate(draft: EditDraft) {
    if (!user || !groupId) return;
    const costRaw = draft.costPerNight.trim();
    const cost = costRaw === "" ? null : parseInt(costRaw, 10);
    if (cost !== null && (isNaN(cost) || cost < 0)) { setError("費用を正しく入力してください"); return; }
    setBusy("add");
    setError(null);
    try {
      await addDestinationCandidate(groupId, user.uid, user.displayName, {
        name: draft.name.trim(),
        url: draft.url.trim() || null,
        costPerNight: cost ?? 0,
        description: draft.description.trim() || null,
      });
      setShowAddForm(false);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateCandidate(candidateId: string, draft: EditDraft) {
    if (!groupId) return;
    const costRaw = draft.costPerNight.trim();
    const cost = costRaw === "" ? null : parseInt(costRaw, 10);
    if (cost !== null && (isNaN(cost) || cost < 0)) { setError("費用を正しく入力してください"); return; }
    setBusy(`edit-${candidateId}`);
    setError(null);
    try {
      await updateDestinationCandidate(groupId, candidateId, {
        name: draft.name.trim(),
        url: draft.url.trim() || null,
        costPerNight: cost ?? 0,
        description: draft.description.trim() || null,
      });
      setEditingId(null);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "編集に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleVote(candidateId: string, answer: DestinationAnswer) {
    if (!user || !groupId) return;
    setBusy(`vote-${candidateId}-${answer}`);
    setError(null);
    try {
      await castDestinationVote(groupId, user.uid, candidateId, answer);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "投票に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDecide(candidateId: string) {
    if (!user || !groupId) return;
    const c = candidates.find((x) => x.id === candidateId);
    if (!c) return;
    if (!confirm(`「${c.data.name}」を目的地として確定しますか？`)) return;
    setBusy(`decide-${candidateId}`);
    setError(null);
    try {
      await updateDestination(groupId, c.data.name);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "確定に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteCandidate(candidateId: string) {
    if (!groupId) return;
    const c = candidates.find((x) => x.id === candidateId);
    if (!confirm(`「${c?.data.name}」を削除しますか？`)) return;
    setBusy(`del-${candidateId}`);
    setError(null);
    try {
      await deleteDestinationCandidate(groupId, candidateId);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  // 集計
  const stats = useMemo(() => {
    return candidates.map((c) => {
      const cvotes = votes.filter((v) => v.data.candidateId === c.id);
      const first = cvotes.filter((v) => v.data.answer === "first").length;
      const want = cvotes.filter((v) => v.data.answer === "want").length;
      const reserve = cvotes.filter((v) => v.data.answer === "reserve").length;
      return { id: c.id, first, want, reserve, total: cvotes.length };
    });
  }, [candidates, votes]);

  if (group === undefined) {
    return <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10"><p className="text-sm text-zinc-500">読み込み中…</p></div>;
  }
  if (group === null) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">旅行が見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm text-zinc-900 underline">旅行一覧へ</Link>
      </div>
    );
  }

  const isOwner = user && group.ownerId === user.uid;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link href={`/groups/${groupId}`} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        ← 旅行詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">目的地を決める</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        候補を追加して、全員で投票しましょう。最後にオーナーが目的地を確定します。
      </p>

      {group.destination ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            ✓ 目的地確定: {group.destination}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      ) : null}

      {/* ── 比較テーブル ── */}
      {candidates.length > 0 ? (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[48%]" />
                <col className="w-[22%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                  <th className="px-4 py-3">目的地</th>
                  <th className="px-2 py-3 text-right">費用</th>
                  <th className="px-2 py-3">補足</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const s = stats.find((x) => x.id === c.id)!;
                  const myVote = votes.find((v) => v.data.candidateId === c.id && v.data.userId === user?.uid);
                  const isDecided = group.destination === c.data.name;

                  if (editingId === c.id) {
                    return (
                      <tr key={c.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                        <td colSpan={3} className="px-4 py-4">
                          <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">「{c.data.name}」を編集</p>
                          <CandidateForm
                            initial={{
                              name: c.data.name,
                              url: c.data.url ?? "",
                              costPerNight: String(c.data.costPerNight),
                              description: c.data.description ?? "",
                            }}
                            onSubmit={(d) => handleUpdateCandidate(c.id, d)}
                            onCancel={() => setEditingId(null)}
                            submitLabel="保存"
                            busy={busy === `edit-${c.id}`}
                          />
                        </td>
                      </tr>
                    );
                  }

                  const rowBg = isDecided ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-white dark:bg-zinc-900/40";
                  return (
                    <Fragment key={c.id}>
                      {/* 行1: 目的地名・費用・補足 */}
                      <tr className={rowBg}>
                        {/* 目的地名 */}
                        <td className="px-4 pt-3 pb-1 align-top">
                          <div className="flex flex-wrap items-start gap-1.5">
                            {isDecided ? (
                              <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                確定
                              </span>
                            ) : null}
                            {c.data.url ? (
                              <a
                                href={c.data.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-words font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {c.data.name}
                              </a>
                            ) : (
                              <span className="break-words font-medium text-zinc-900 dark:text-zinc-50">
                                {c.data.name}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] text-zinc-400">
                            提案: {c.data.proposedByDisplayName ?? "—"}
                          </p>
                        </td>
                        {/* 費用 */}
                        <td className="whitespace-nowrap px-2 pt-3 pb-1 text-right align-top font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          {c.data.costPerNight ? formatCost(c.data.costPerNight) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                        {/* 補足 */}
                        <td className="break-words px-2 pt-3 pb-1 align-top text-xs text-zinc-500 dark:text-zinc-400">
                          {c.data.description ?? (
                            <span className="text-zinc-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>

                      {/* 行2: 投票バー（全列結合）+ 操作ボタン */}
                      <tr className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${rowBg}`}>
                        <td colSpan={3} className="px-4 pb-3 pt-1">
                          <div className="space-y-1">
                            {(["first", "want", "reserve"] as DestinationAnswer[]).map((a) => {
                              const count = a === "first" ? s.first : a === "want" ? s.want : s.reserve;
                              const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
                              const isSelected = myVote?.data.answer === a;
                              const ICONS: Record<DestinationAnswer, string> = { first: "🙋", want: "👍", reserve: "🤏" };
                              return (
                                <div key={a} className="flex items-center gap-1.5 text-xs">
                                  <span className="w-20 shrink-0 truncate text-zinc-500">{ANSWER_LABELS[a]}</span>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                                    <div className={`h-full ${ANSWER_BAR_COLORS[a]} transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="w-3 shrink-0 text-right text-[10px] text-zinc-400">{count}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleVote(c.id, a)}
                                    disabled={busy !== null}
                                    title={ANSWER_LABELS[a]}
                                    className={`shrink-0 rounded-full p-0.5 text-base leading-none transition hover:scale-110 disabled:opacity-40 ${isSelected ? "ring-2 ring-offset-1 ring-zinc-400" : "opacity-50 hover:opacity-100"}`}
                                  >
                                    {ICONS[a]}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {(isOwner || (user && c.data.proposedByUserId === user.uid)) ? (
                            <div className="mt-2 flex flex-wrap gap-1 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-700">
                              {isOwner && !isDecided ? (
                                <button type="button" onClick={() => handleDecide(c.id)} disabled={busy !== null}
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                                  {busy === `decide-${c.id}` ? "…" : "確定"}
                                </button>
                              ) : null}
                              <button type="button" onClick={() => setEditingId(c.id)} disabled={busy !== null}
                                className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400">
                                編集
                              </button>
                              <button type="button" onClick={() => handleDeleteCandidate(c.id)} disabled={busy !== null}
                                className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400">
                                削除
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

        </>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          まだ候補がありません。下のボタンから追加してください。
        </p>
      )}

      {/* 候補を追加 */}
      {!group.destination ? (
        <div className="mt-6">
          {showAddForm ? (
            <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
              <h2 className="mb-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">候補を追加</h2>
              <CandidateForm
                onSubmit={handleAddCandidate}
                onCancel={() => setShowAddForm(false)}
                submitLabel="追加する"
                busy={busy === "add"}
              />
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              ＋ 候補を追加
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
