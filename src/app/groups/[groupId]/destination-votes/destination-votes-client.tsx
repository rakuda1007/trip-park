"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  addDestinationCandidate,
  castDestinationVote,
  deleteDestinationCandidate,
  listDestinationCandidates,
  listDestinationVotes,
  type CandidateItem,
  type VoteItem,
} from "@/lib/firestore/destination-votes";
import { getGroup, updateDestination } from "@/lib/firestore/groups";
import type { DestinationAnswer } from "@/types/destination";
import type { GroupDoc } from "@/types/group";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const ANSWER_LABELS: Record<DestinationAnswer, string> = {
  want: "行きたい 🙋",
  ok: "まあいい 👍",
  no: "行きたくない 🙅",
};

const ANSWER_COLORS: Record<DestinationAnswer, string> = {
  want: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  ok: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  no: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

function VoteBar({
  candidates,
  votes,
}: {
  candidates: CandidateItem[];
  votes: VoteItem[];
}) {
  const stats = useMemo(() => {
    return candidates.map((c) => {
      const cvotes = votes.filter((v) => v.data.candidateId === c.id);
      const want = cvotes.filter((v) => v.data.answer === "want").length;
      const ok = cvotes.filter((v) => v.data.answer === "ok").length;
      const no = cvotes.filter((v) => v.data.answer === "no").length;
      const total = cvotes.length;
      return { id: c.id, want, ok, no, total };
    });
  }, [candidates, votes]);

  if (candidates.length === 0) return null;

  return (
    <div className="space-y-2">
      {stats.map((s) => {
        const c = candidates.find((x) => x.id === s.id);
        if (!c) return null;
        const pct = (n: number) => (s.total > 0 ? Math.round((n / s.total) * 100) : 0);
        return (
          <div key={s.id} className="text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-20 truncate font-medium text-zinc-700 dark:text-zinc-300">
                {c.data.name}
              </span>
              <div className="flex flex-1 overflow-hidden rounded-full">
                {s.want > 0 ? (
                  <div
                    className="h-3 bg-emerald-400"
                    style={{ width: `${pct(s.want)}%` }}
                    title={`行きたい: ${s.want}`}
                  />
                ) : null}
                {s.ok > 0 ? (
                  <div
                    className="h-3 bg-blue-400"
                    style={{ width: `${pct(s.ok)}%` }}
                    title={`まあいい: ${s.ok}`}
                  />
                ) : null}
                {s.no > 0 ? (
                  <div
                    className="h-3 bg-red-400"
                    style={{ width: `${pct(s.no)}%` }}
                    title={`行きたくない: ${s.no}`}
                  />
                ) : null}
                {s.total === 0 ? (
                  <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-700" />
                ) : null}
              </div>
              <span className="text-zinc-400">{s.total}票</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-emerald-400" />
          行きたい
        </span>
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-blue-400" />
          まあいい
        </span>
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-red-400" />
          行きたくない
        </span>
      </div>
    </div>
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

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const isOwnerOrAdmin =
    group &&
    user &&
    (group.ownerId === user.uid ||
      true); // 簡略化：実際には memberRole を取得する

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

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !groupId || !newName.trim()) return;
    setBusy("add");
    setError(null);
    try {
      await addDestinationCandidate(groupId, user.uid, user.displayName, {
        name: newName.trim(),
        description: newDesc.trim() || null,
      });
      setNewName("");
      setNewDesc("");
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "追加に失敗しました");
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

  if (group === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }

  if (group === null) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">旅行が見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm text-zinc-900 underline">
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
        ← 旅行詳細
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        目的地を決める
      </h1>
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
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {/* 集計バー */}
      {candidates.length > 0 ? (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            集計
          </p>
          <VoteBar candidates={candidates} votes={votes} />
        </div>
      ) : null}

      {/* 候補一覧 */}
      <div className="mt-6 space-y-4">
        {candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
            まだ候補がありません。下のフォームから追加してください。
          </p>
        ) : (
          candidates.map((c) => {
            const myVote = votes.find(
              (v) => v.data.candidateId === c.id && v.data.userId === user?.uid,
            );
            const cvotes = votes.filter((v) => v.data.candidateId === c.id);
            const isDecided = group.destination === c.data.name;

            return (
              <div
                key={c.id}
                className={`rounded-lg border px-4 py-3 ${isDecided ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20" : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {c.data.name}
                      </p>
                      {isDecided ? (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          確定
                        </span>
                      ) : null}
                    </div>
                    {c.data.description ? (
                      <p className="mt-0.5 text-xs text-zinc-500">{c.data.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-400">
                      提案: {c.data.proposedByDisplayName ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 text-xs">
                    {user && group.ownerId === user.uid && !isDecided ? (
                      <button
                        type="button"
                        onClick={() => handleDecide(c.id)}
                        disabled={busy !== null}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                      >
                        {busy === `decide-${c.id}` ? "…" : "確定"}
                      </button>
                    ) : null}
                    {user &&
                    (group.ownerId === user.uid ||
                      c.data.proposedByUserId === user.uid) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteCandidate(c.id)}
                        disabled={busy !== null}
                        className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400"
                      >
                        削除
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* 投票ボタン */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["want", "ok", "no"] as DestinationAnswer[]).map((a) => {
                    const isSelected = myVote?.data.answer === a;
                    const count = cvotes.filter((v) => v.data.answer === a).length;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => handleVote(c.id, a)}
                        disabled={busy !== null}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${isSelected ? ANSWER_COLORS[a] + " ring-2 ring-offset-1" : "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"} disabled:opacity-50`}
                      >
                        {ANSWER_LABELS[a]}
                        {count > 0 ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] ${isSelected ? "bg-white/60" : "bg-zinc-200 dark:bg-zinc-600"}`}
                          >
                            {count}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 候補を追加 */}
      {!group.destination ? (
        <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            候補を追加
          </h2>
          <form onSubmit={handleAddCandidate} className="mt-3 space-y-3">
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 沖縄、箱根"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="補足（費用目安など）任意"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={busy !== null}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy === "add" ? "追加中…" : "追加する"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
