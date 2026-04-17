"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import {
  addDestinationCandidate,
  addDestinationPoll,
  castDestinationVote,
  deleteDestinationCandidate,
  deleteDestinationPoll,
  deleteDestinationVote,
  listDestinationCandidates,
  listDestinationPolls,
  listDestinationVotes,
  listLegacyDestinationCandidates,
  migrateLegacyDestinationPollIfNeeded,
  setPollDecidedDestination,
  updateDestinationCandidate,
  updateDestinationPollMeta,
  type CandidateItem,
  type PollItem,
  type VoteItem,
} from "@/lib/firestore/destination-votes";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import type { DestinationAnswer } from "@/types/destination";
import type { GroupDoc } from "@/types/group";
import Link from "next/link";
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

type PollBundle = {
  poll: PollItem;
  candidates: CandidateItem[];
  votes: VoteItem[];
};

export function DestinationVotesClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [bundles, setBundles] = useState<PollBundle[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, string>>(new Map());
  const [openVoters, setOpenVoters] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAddFormByPoll, setShowAddFormByPoll] = useState<Set<string>>(
    new Set(),
  );
  const [editingIdByPoll, setEditingIdByPoll] = useState<
    Record<string, string | null>
  >({});
  const [lineShareUrl, setLineShareUrl] = useState("");
  const [showNewPollForm, setShowNewPollForm] = useState(false);
  const [newPollTitle, setNewPollTitle] = useState("1日目の目的地");
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [editPollTitleDraft, setEditPollTitleDraft] = useState("");
  const [editPollSortDraft, setEditPollSortDraft] = useState("0");
  /** 旧レイアウトのデータが残っているが投票ブロックが無い（オーナーによる移行待ち） */
  const [legacyMigrationHint, setLegacyMigrationHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !groupId) return;
    setLineShareUrl(window.location.href);
  }, [groupId]);

  useEffect(() => {
    setGroup(undefined);
    setBundles([]);
    setError(null);
    setLegacyMigrationHint(false);
  }, [groupId]);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    let g: GroupDoc | null;
    try {
      g = await getGroup(groupId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "旅行情報の取得に失敗しました",
      );
      return;
    }
    if (!g) {
      setGroup(null);
      setBundles([]);
      return;
    }
    setGroup(g);

    if (user) {
      try {
        await migrateLegacyDestinationPollIfNeeded(groupId, user.uid);
      } catch (e) {
        setError(
          e instanceof Error
            ? `データ移行: ${e.message}`
            : "データ移行に失敗しました",
        );
      }
    }

    try {
      const m = await listMembers(groupId);
      setMemberMap(
        new Map(
          m.map((x) => [
            x.userId,
            x.data.displayName ?? x.userId.slice(0, 6) + "…",
          ]),
        ),
      );
    } catch (e) {
      setMemberMap(new Map());
      setError(
        e instanceof Error ? e.message : "メンバー一覧の取得に失敗しました",
      );
    }

    let polls: Awaited<ReturnType<typeof listDestinationPolls>> = [];
    try {
      polls = await listDestinationPolls(groupId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "投票ブロックの取得に失敗しました",
      );
      setBundles([]);
      return;
    }

    const loaded: PollBundle[] = [];
    for (const poll of polls) {
      try {
        const [candidates, votes] = await Promise.all([
          listDestinationCandidates(groupId, poll.id),
          listDestinationVotes(groupId, poll.id),
        ]);
        loaded.push({ poll, candidates, votes });
      } catch (e) {
        setError(
          e instanceof Error
            ? `${poll.data.title}: ${e.message}`
            : "候補・投票の取得に失敗しました",
        );
      }
    }
    setBundles(loaded);

    if (polls.length === 0) {
      try {
        const legacy = await listLegacyDestinationCandidates(groupId);
        setLegacyMigrationHint(
          legacy.length > 0 || !!(g.destination?.trim()),
        );
      } catch {
        setLegacyMigrationHint(false);
      }
    } else {
      setLegacyMigrationHint(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddCandidate(pollId: string, draft: EditDraft) {
    if (!user || !groupId) return;
    const costRaw = draft.costPerNight.trim();
    const cost = costRaw === "" ? null : parseInt(costRaw, 10);
    if (cost !== null && (isNaN(cost) || cost < 0)) {
      setError("費用を正しく入力してください");
      return;
    }
    setBusy(`add-${pollId}`);
    setError(null);
    try {
      await addDestinationCandidate(groupId, pollId, user.uid, user.displayName, {
        name: draft.name.trim(),
        url: draft.url.trim() || null,
        costPerNight: cost ?? 0,
        description: draft.description.trim() || null,
      });
      setShowAddFormByPoll((prev) => {
        const next = new Set(prev);
        next.delete(pollId);
        return next;
      });
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateCandidate(
    pollId: string,
    candidateId: string,
    draft: EditDraft,
  ) {
    if (!groupId) return;
    const costRaw = draft.costPerNight.trim();
    const cost = costRaw === "" ? null : parseInt(costRaw, 10);
    if (cost !== null && (isNaN(cost) || cost < 0)) {
      setError("費用を正しく入力してください");
      return;
    }
    setBusy(`edit-${candidateId}`);
    setError(null);
    try {
      await updateDestinationCandidate(groupId, pollId, candidateId, {
        name: draft.name.trim(),
        url: draft.url.trim() || null,
        costPerNight: cost ?? 0,
        description: draft.description.trim() || null,
      });
      setEditingIdByPoll((prev) => ({ ...prev, [pollId]: null }));
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "編集に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleVote(
    pollId: string,
    candidateId: string,
    answer: DestinationAnswer,
    votes: VoteItem[],
  ) {
    if (!user || !groupId) return;
    setBusy(`vote-${pollId}-${candidateId}-${answer}`);
    setError(null);
    try {
      const myOnThis = votes.find(
        (v) =>
          v.data.userId === user.uid && v.data.candidateId === candidateId,
      );

      if (myOnThis?.data.answer === answer) {
        await deleteDestinationVote(groupId, pollId, user.uid, candidateId);
        await load();
        return;
      }

      if (answer === "first" || answer === "want") {
        const othersSameAnswer = votes.filter(
          (v) =>
            v.data.userId === user.uid &&
            v.data.answer === answer &&
            v.data.candidateId !== candidateId,
        );
        for (const v of othersSameAnswer) {
          await deleteDestinationVote(groupId, pollId, user.uid, v.data.candidateId);
        }
      }

      await castDestinationVote(groupId, pollId, user.uid, candidateId, answer);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "投票に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDecide(pollId: string, candidateId: string) {
    if (!user || !groupId) return;
    const b = bundles.find((x) => x.poll.id === pollId);
    const c = b?.candidates.find((x) => x.id === candidateId);
    if (!b || !c) return;
    if (!confirm(`「${c.data.name}」を「${b.poll.data.title}」として確定しますか？`)) return;
    setBusy(`decide-${pollId}-${candidateId}`);
    setError(null);
    try {
      await setPollDecidedDestination(groupId, pollId, c.data.name);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "確定に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleUndecide(pollId: string) {
    if (!groupId) return;
    if (!confirm("このブロックの確定を解除しますか？再度投票・確定できます。")) return;
    setBusy(`undecide-${pollId}`);
    setError(null);
    try {
      await setPollDecidedDestination(groupId, pollId, null);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "解除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteCandidate(pollId: string, candidateId: string) {
    if (!groupId) return;
    const b = bundles.find((x) => x.poll.id === pollId);
    const c = b?.candidates.find((x) => x.id === candidateId);
    if (!confirm(`「${c?.data.name}」を削除しますか？`)) return;
    setBusy(`del-${candidateId}`);
    setError(null);
    try {
      await deleteDestinationCandidate(groupId, pollId, candidateId);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreatePoll() {
    if (!user || !groupId) return;
    const title = newPollTitle.trim();
    if (!title) {
      setError("タイトルを入力してください");
      return;
    }
    const sortOrder = bundles.length;
    setBusy("new-poll");
    setError(null);
    try {
      await addDestinationPoll(groupId, user.uid, {
        title,
        sortOrder,
      });
      setShowNewPollForm(false);
      setNewPollTitle(`${sortOrder + 2}日目の目的地`);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "作成に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleSavePollMeta(pollId: string) {
    if (!groupId) return;
    const sort = parseInt(editPollSortDraft, 10);
    if (isNaN(sort)) {
      setError("並び順は整数で入力してください");
      return;
    }
    setBusy(`poll-meta-${pollId}`);
    setError(null);
    try {
      await updateDestinationPollMeta(groupId, pollId, {
        title: editPollTitleDraft.trim(),
        sortOrder: sort,
      });
      setEditingPollId(null);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePoll(pollId: string) {
    if (!groupId) return;
    const b = bundles.find((x) => x.poll.id === pollId);
    if (!confirm(`投票ブロック「${b?.poll.data.title}」を削除しますか？候補と投票もすべて消えます。`)) return;
    setBusy(`del-poll-${pollId}`);
    setError(null);
    try {
      await deleteDestinationPoll(groupId, pollId);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  const voterNames = useCallback(
    (
      pollId: string,
      candidateId: string,
      answer: DestinationAnswer,
      votes: VoteItem[],
    ): string[] =>
      votes
        .filter(
          (v) =>
            v.data.candidateId === candidateId && v.data.answer === answer,
        )
        .map(
          (v) =>
            memberMap.get(v.data.userId) ?? v.data.userId.slice(0, 6) + "…",
        ),
    [memberMap],
  );

  function toggleVoters(key: string) {
    setOpenVoters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (group === undefined) {
    if (error) {
      return (
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void load();
            }}
            className="mt-4 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            再試行
          </button>
        </div>
      );
    }
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
        <Link
          href="/groups"
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
          旅行一覧へ
        </Link>
      </div>
    );
  }

  const isOwner = user && group.ownerId === user.uid;

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
        投票ブロックごとにタイトル（例:「1日目の目的地」）を付けられます。日ごとに別の候補で投票・確定できます。オーナーは確定後も解除してやり直せます。
        「ここに行きたい」「行きたい」はそれぞれ1候補だけ選べます。選んだ状態でもう一度タップすると取り消せます。
      </p>

      <div className="mt-3">
        <a
          href={
            lineShareUrl
              ? `https://line.me/R/msg/text/?${encodeURIComponent(
                  `「${group.name}」の目的地を決める\n${lineShareUrl}`,
                )}`
              : undefined
          }
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-md bg-[#06C755] px-3 py-2 text-sm font-medium text-white hover:bg-[#05b34c] ${
            !lineShareUrl ? "pointer-events-none opacity-50" : ""
          }`}
          aria-label="LINEでこのページのリンクを送る"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4 shrink-0"
            aria-hidden
          >
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.444 3.317V8.108c0-.345.282-.63.63-.63.345 0 .628.285.628.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.070 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
          LINEで送る
        </a>
      </div>

      {group.destination ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            確定の概要（旅行トップにも表示）
          </p>
          <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
            {group.destination}
          </p>
        </div>
      ) : null}

      {legacyMigrationHint ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {isOwner
              ? "以前の目的地データは、オーナーまたは管理者がこのページを開いたときに自動で移行されます。表示が変わらない場合はページを再読み込みするか、Firestore のセキュリティルールを最新にデプロイしてください。"
              : "以前の目的地データがまだ新しい形式に移行されていません。オーナーまたは管理者に、このページを一度開いてもらってください。"}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {/* 新規ブロック */}
      <div className="mt-6">
        {showNewPollForm ? (
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              投票ブロックを追加
            </h2>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              タイトル
              <input
                type="text"
                value={newPollTitle}
                onChange={(e) => setNewPollTitle(e.target.value)}
                placeholder="例: 1日目の目的地"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleCreatePoll}
                disabled={busy !== null}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy === "new-poll" ? "作成中…" : "作成する"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewPollForm(false)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                キャンセル
              </button>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNewPollTitle(
                bundles.length === 0
                  ? "1日目の目的地"
                  : `${bundles.length + 1}日目の目的地`,
              );
              setShowNewPollForm(true);
            }}
            className="rounded-md border border-dashed border-zinc-400 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ＋ 投票ブロックを追加（日別など）
          </button>
        )}
      </div>

      {bundles.length === 0 && !showNewPollForm ? (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          まだ投票ブロックがありません。上のボタンから追加するか、候補がある場合はページを再読み込みしてください（旧データは自動で移行されます）。
        </p>
      ) : null}

      {bundles.map((bundle) => (
        <PollSection
          key={bundle.poll.id}
          bundle={bundle}
          user={user}
          isOwner={!!isOwner}
          busy={busy}
          editingPollId={editingPollId}
          setEditingPollId={setEditingPollId}
          editPollTitleDraft={editPollTitleDraft}
          setEditPollTitleDraft={setEditPollTitleDraft}
          editPollSortDraft={editPollSortDraft}
          setEditPollSortDraft={setEditPollSortDraft}
          onSavePollMeta={handleSavePollMeta}
          onDeletePoll={handleDeletePoll}
          showAddForm={showAddFormByPoll.has(bundle.poll.id)}
          setShowAddForm={(show) =>
            setShowAddFormByPoll((prev) => {
              const next = new Set(prev);
              if (show) next.add(bundle.poll.id);
              else next.delete(bundle.poll.id);
              return next;
            })
          }
          editingCandidateId={editingIdByPoll[bundle.poll.id] ?? null}
          setEditingCandidateId={(id) =>
            setEditingIdByPoll((prev) => ({ ...prev, [bundle.poll.id]: id }))
          }
          onAddCandidate={handleAddCandidate}
          onUpdateCandidate={handleUpdateCandidate}
          onVote={handleVote}
          onDecide={handleDecide}
          onUndecide={handleUndecide}
          onDeleteCandidate={handleDeleteCandidate}
          voterNames={voterNames}
          openVoters={openVoters}
          toggleVoters={toggleVoters}
        />
      ))}
    </div>
  );
}

function PollSection({
  bundle,
  user,
  isOwner,
  busy,
  editingPollId,
  setEditingPollId,
  editPollTitleDraft,
  setEditPollTitleDraft,
  editPollSortDraft,
  setEditPollSortDraft,
  onSavePollMeta,
  onDeletePoll,
  showAddForm,
  setShowAddForm,
  editingCandidateId,
  setEditingCandidateId,
  onAddCandidate,
  onUpdateCandidate,
  onVote,
  onDecide,
  onUndecide,
  onDeleteCandidate,
  voterNames,
  openVoters,
  toggleVoters,
}: {
  bundle: PollBundle;
  user: ReturnType<typeof useAuth>["user"];
  isOwner: boolean;
  busy: string | null;
  editingPollId: string | null;
  setEditingPollId: (id: string | null) => void;
  editPollTitleDraft: string;
  setEditPollTitleDraft: (s: string) => void;
  editPollSortDraft: string;
  setEditPollSortDraft: (s: string) => void;
  onSavePollMeta: (pollId: string) => void;
  onDeletePoll: (pollId: string) => void;
  showAddForm: boolean;
  setShowAddForm: (show: boolean) => void;
  editingCandidateId: string | null;
  setEditingCandidateId: (id: string | null) => void;
  onAddCandidate: (pollId: string, draft: EditDraft) => void;
  onUpdateCandidate: (
    pollId: string,
    candidateId: string,
    draft: EditDraft,
  ) => void;
  onVote: (
    pollId: string,
    candidateId: string,
    answer: DestinationAnswer,
    votes: VoteItem[],
  ) => void;
  onDecide: (pollId: string, candidateId: string) => void;
  onUndecide: (pollId: string) => void;
  onDeleteCandidate: (pollId: string, candidateId: string) => void;
  voterNames: (
    pollId: string,
    candidateId: string,
    answer: DestinationAnswer,
    votes: VoteItem[],
  ) => string[];
  openVoters: Set<string>;
  toggleVoters: (key: string) => void;
}) {
  const { poll, candidates, votes } = bundle;
  const pollId = poll.id;
  const decided = poll.data.decidedDestinationName?.trim() ?? "";
  const decidedLocked = decided.length > 0;

  const stats = useMemo(() => {
    return candidates.map((c) => {
      const cvotes = votes.filter((v) => v.data.candidateId === c.id);
      const first = cvotes.filter((v) => v.data.answer === "first").length;
      const want = cvotes.filter((v) => v.data.answer === "want").length;
      const reserve = cvotes.filter((v) => v.data.answer === "reserve").length;
      return { id: c.id, first, want, reserve, total: cvotes.length };
    });
  }, [candidates, votes]);

  const orderedCandidates = useMemo(() => {
    const statById = new Map(stats.map((s) => [s.id, s]));
    return [...candidates].sort((a, b) => {
      const sa = statById.get(a.id);
      const sb = statById.get(b.id);
      const fa = sa?.first ?? 0;
      const fb = sb?.first ?? 0;
      if (fb !== fa) return fb - fa;
      const wa = sa?.want ?? 0;
      const wb = sb?.want ?? 0;
      if (wb !== wa) return wb - wa;
      const ra = sa?.reserve ?? 0;
      const rb = sb?.reserve ?? 0;
      if (rb !== ra) return rb - ra;
      const ta = a.data.createdAt;
      const tb = b.data.createdAt;
      const sec = (x: unknown) =>
        x && typeof x === "object" && "seconds" in x
          ? (x as { seconds: number }).seconds
          : 0;
      return sec(ta) - sec(tb);
    });
  }, [candidates, stats]);

  const canEditPollMeta =
    isOwner || (user && poll.data.createdByUserId === user.uid);

  return (
    <section className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {editingPollId === pollId ? (
          <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900/50">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              タイトル
              <input
                type="text"
                value={editPollTitleDraft}
                onChange={(e) => setEditPollTitleDraft(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              並び順（小さいほど上）
              <input
                type="number"
                value={editPollSortDraft}
                onChange={(e) => setEditPollSortDraft(e.target.value)}
                className="mt-1 w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSavePollMeta(pollId)}
                disabled={busy !== null}
                className="rounded-md bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditingPollId(null)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-600"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {poll.data.title}
            </h2>
            {decidedLocked ? (
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                ✓ 確定: {poll.data.decidedDestinationName}
              </p>
            ) : null}
          </div>
        )}
        {editingPollId !== pollId ? (
          <div className="flex flex-wrap gap-1">
            {canEditPollMeta ? (
              <button
                type="button"
                onClick={() => {
                  setEditPollTitleDraft(poll.data.title);
                  setEditPollSortDraft(String(poll.data.sortOrder));
                  setEditingPollId(pollId);
                }}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
              >
                タイトル・順序を編集
              </button>
            ) : null}
            {isOwner ? (
              <button
                type="button"
                onClick={() => onDeletePoll(pollId)}
                disabled={busy !== null}
                className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400"
              >
                ブロック削除
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {decidedLocked ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            確定中は投票を変更できません。やり直す場合はオーナーが解除してください。
          </p>
          {isOwner ? (
            <button
              type="button"
              onClick={() => onUndecide(pollId)}
              disabled={busy !== null}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              確定を解除
            </button>
          ) : null}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
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
              {orderedCandidates.map((c) => {
                const s = stats.find((x) => x.id === c.id)!;
                const myVote = votes.find(
                  (v) =>
                    v.data.candidateId === c.id && v.data.userId === user?.uid,
                );
                const isDecidedRow =
                  decidedLocked &&
                  poll.data.decidedDestinationName === c.data.name;

                if (editingCandidateId === c.id) {
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td colSpan={3} className="px-4 py-4">
                        <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                          「{c.data.name}」を編集
                        </p>
                        <CandidateForm
                          initial={{
                            name: c.data.name,
                            url: c.data.url ?? "",
                            costPerNight: String(c.data.costPerNight),
                            description: c.data.description ?? "",
                          }}
                          onSubmit={(d) =>
                            onUpdateCandidate(pollId, c.id, d)
                          }
                          onCancel={() => setEditingCandidateId(null)}
                          submitLabel="保存"
                          busy={busy === `edit-${c.id}`}
                        />
                      </td>
                    </tr>
                  );
                }

                const rowBg = isDecidedRow
                  ? "bg-emerald-50 dark:bg-emerald-950/20"
                  : "bg-white dark:bg-zinc-900/40";
                return (
                  <Fragment key={c.id}>
                    <tr className={rowBg}>
                      <td className="px-4 pt-3 pb-1 align-top">
                        <div className="flex flex-wrap items-start gap-1.5">
                          {isDecidedRow ? (
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
                      <td className="whitespace-nowrap px-2 pt-3 pb-1 text-right align-top font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {c.data.costPerNight ? (
                          formatCost(c.data.costPerNight)
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="break-words px-2 pt-3 pb-1 align-top text-xs text-zinc-500 dark:text-zinc-400">
                        {c.data.description ?? (
                          <span className="text-zinc-300 dark:text-zinc-600">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr
                      className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${rowBg}`}
                    >
                      <td colSpan={3} className="px-4 pb-3 pt-1">
                        <div className="space-y-1">
                          {(["first", "want", "reserve"] as DestinationAnswer[]).map(
                            (a) => {
                              const count =
                                a === "first"
                                  ? s.first
                                  : a === "want"
                                    ? s.want
                                    : s.reserve;
                              const pct =
                                s.total > 0
                                  ? Math.round((count / s.total) * 100)
                                  : 0;
                              const isSelected = myVote?.data.answer === a;
                              const ICONS: Record<DestinationAnswer, string> = {
                                first: "🙋",
                                want: "👍",
                                reserve: "🤏",
                              };
                              const voterKey = `${pollId}_${c.id}_${a}`;
                              const names = voterNames(pollId, c.id, a, votes);
                              const isOpen = openVoters.has(voterKey);
                              return (
                                <div key={a} className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="w-28 shrink-0 truncate text-zinc-500">
                                      {ANSWER_LABELS[a]}
                                    </span>
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                                      <div
                                        className={`h-full ${ANSWER_BAR_COLORS[a]} transition-all`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      title={
                                        names.length > 0
                                          ? names.join("・")
                                          : undefined
                                      }
                                      onClick={() =>
                                        count > 0 && toggleVoters(voterKey)
                                      }
                                      disabled={count === 0}
                                      className={`w-4 shrink-0 text-right text-[10px] transition-colors disabled:cursor-default ${isOpen ? "font-semibold text-zinc-700 dark:text-zinc-200" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
                                    >
                                      {count}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        !decidedLocked &&
                                        onVote(pollId, c.id, a, votes)
                                      }
                                      disabled={busy !== null || decidedLocked}
                                      title={
                                        isSelected
                                          ? `${ANSWER_LABELS[a]}（もう一度タップで取り消し）`
                                          : `${ANSWER_LABELS[a]}${a === "first" || a === "want" ? "（他候補では同じ種別は1つだけ）" : ""}`
                                      }
                                      className={`shrink-0 rounded-full p-0.5 text-base leading-none transition hover:scale-110 disabled:opacity-40 ${isSelected ? "ring-2 ring-offset-1 ring-zinc-400" : "opacity-50 hover:opacity-100"}`}
                                    >
                                      {ICONS[a]}
                                    </button>
                                  </div>
                                  {isOpen && names.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pl-[calc(7rem+6px)]">
                                      {names.map((n) => (
                                        <span
                                          key={n}
                                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                        >
                                          {n}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                        {(isOwner ||
                          (user && c.data.proposedByUserId === user.uid)) &&
                        !decidedLocked ? (
                          <div className="mt-2 flex flex-wrap gap-1 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-700">
                            {isOwner && !isDecidedRow ? (
                              <button
                                type="button"
                                onClick={() => onDecide(pollId, c.id)}
                                disabled={busy !== null}
                                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                              >
                                {busy === `decide-${pollId}-${c.id}`
                                  ? "…"
                                  : "確定"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setEditingCandidateId(c.id)}
                              disabled={busy !== null}
                              className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onDeleteCandidate(pollId, c.id)
                              }
                              disabled={busy !== null}
                              className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400"
                            >
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
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          このブロックにはまだ候補がありません。
        </p>
      )}

      {!decidedLocked ? (
        <div className="mt-4">
          {showAddForm ? (
            <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
              <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                候補を追加
              </h3>
              <CandidateForm
                onSubmit={(d) => onAddCandidate(pollId, d)}
                onCancel={() => setShowAddForm(false)}
                submitLabel="追加する"
                busy={busy === `add-${pollId}`}
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
    </section>
  );
}
