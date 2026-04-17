"use client";

import { useAuth } from "@/contexts/auth-context";
import { useGroupRouteId } from "@/contexts/group-route-context";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import {
  addScheduleCandidate,
  clearScheduleConfirm,
  getScheduleConfig,
  listScheduleCandidates,
  listScheduleResponses,
  removeScheduleCandidate,
  setMyScheduleResponse,
  setScheduleConfirm,
} from "@/lib/firestore/schedule";
import type { GroupDoc, MemberDoc } from "@/types/group";
import type {
  ScheduleAnswer,
  ScheduleCandidateDoc,
  ScheduleConfigDoc,
} from "@/types/schedule";
import { VisibilityBadge } from "@/components/visibility-badge";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function answerSymbol(a: ScheduleAnswer | undefined): string {
  if (!a) return "—";
  if (a === "yes") return "○";
  if (a === "maybe") return "△";
  return "×";
}

function formatDateLabel(iso: string): string {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** 旅行の候補など、例: 2026/5/3–5（同一月内） / 2026/5/3–6/1（跨ぎ） */
function formatDateRangeLabel(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatDateLabel(startISO);
  const ps = startISO.split("-").map(Number);
  const pe = endISO.split("-").map(Number);
  if (ps.length !== 3 || pe.length !== 3 || ps.some(Number.isNaN) || pe.some(Number.isNaN)) {
    return `${startISO} – ${endISO}`;
  }
  const [sy, sm, sd] = ps;
  const [ey, em, ed] = pe;
  if (sy === ey && sm === em) {
    return `${sy}/${sm}/${sd}–${ed}`;
  }
  if (sy === ey) {
    return `${sy}/${sm}/${sd}–${em}/${ed}`;
  }
  return `${sy}/${sm}/${sd}–${ey}/${em}/${ed}`;
}

function canManageSchedule(
  group: GroupDoc,
  members: { userId: string; data: MemberDoc }[],
  uid: string,
): boolean {
  if (group.ownerId === uid) return true;
  const m = members.find((x) => x.userId === uid);
  return m?.data.role === "admin";
}

function sortMembers(
  members: { userId: string; data: MemberDoc }[],
  ownerId: string,
): { userId: string; data: MemberDoc }[] {
  const roleOrder: Record<string, number> = {
    owner: 0,
    admin: 1,
    member: 2,
  };
  return [...members].sort((a, b) => {
    if (a.userId === ownerId) return -1;
    if (b.userId === ownerId) return 1;
    const ra = roleOrder[a.data.role] ?? 9;
    const rb = roleOrder[b.data.role] ?? 9;
    if (ra !== rb) return ra - rb;
    const na = a.data.displayName || a.userId;
    const nb = b.data.displayName || b.userId;
    return na.localeCompare(nb, "ja");
  });
}

export function ScheduleClient() {
  const groupId = useGroupRouteId();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [candidates, setCandidates] = useState<
    { id: string; data: ScheduleCandidateDoc }[]
  >([]);
  const [responses, setResponses] = useState<
    { id: string; data: { userId: string; candidateId: string; answer: ScheduleAnswer } }[]
  >([]);
  const [config, setConfig] = useState<ScheduleConfigDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  /** 自分の回答の下書き（候補ID → 回答）。保存前はここだけが更新される */
  const [myDraftAnswers, setMyDraftAnswers] = useState<
    Record<string, ScheduleAnswer | undefined>
  >({});
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const saveBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (!g) {
        setMembers([]);
        setCandidates([]);
        setResponses([]);
        setConfig(null);
        return;
      }
      const [m, cands, resps, cfg] = await Promise.all([
        listMembers(groupId),
        listScheduleCandidates(groupId),
        listScheduleResponses(groupId),
        getScheduleConfig(groupId),
      ]);
      setMembers(m);
      setCandidates(cands);
      setResponses(resps);
      setConfig(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (saveBannerTimer.current) clearTimeout(saveBannerTimer.current);
    };
  }, []);

  const responseMap = useMemo(() => {
    const map = new Map<string, Map<string, ScheduleAnswer>>();
    for (const { data } of responses) {
      let inner = map.get(data.candidateId);
      if (!inner) {
        inner = new Map();
        map.set(data.candidateId, inner);
      }
      inner.set(data.userId, data.answer);
    }
    return map;
  }, [responses]);

  const sortedMembers = useMemo(() => {
    if (!group) return [];
    return sortMembers(members, group.ownerId);
  }, [members, group]);

  const canManage = useMemo(() => {
    if (!user || !group) return false;
    return canManageSchedule(group, members, user.uid);
  }, [user, group, members]);

  const isMember = useMemo(() => {
    if (!user) return false;
    return members.some((m) => m.userId === user.uid);
  }, [user, members]);

  const savedMyAnswer = useCallback(
    (candidateId: string): ScheduleAnswer | undefined =>
      user ? responseMap.get(candidateId)?.get(user.uid) : undefined,
    [user, responseMap],
  );

  useEffect(() => {
    if (!user || candidates.length === 0) {
      setMyDraftAnswers({});
      return;
    }
    const next: Record<string, ScheduleAnswer | undefined> = {};
    for (const c of candidates) {
      next[c.id] = responseMap.get(c.id)?.get(user.uid);
    }
    setMyDraftAnswers(next);
  }, [user, candidates, responseMap]);

  const hasUnsavedMyAnswers = useMemo(() => {
    if (!user || candidates.length === 0) return false;
    for (const c of candidates) {
      const d = myDraftAnswers[c.id];
      const s = savedMyAnswer(c.id);
      if (d !== s) return true;
    }
    return false;
  }, [user, candidates, myDraftAnswers, savedMyAnswer]);

  /** 各候補について、保存済み回答のみを数える（下書きは含めない） */
  const aggregateByCandidate = useMemo(() => {
    const map = new Map<
      string,
      { yes: number; maybe: number; no: number; unanswered: number }
    >();
    for (const c of candidates) {
      let yes = 0;
      let maybe = 0;
      let no = 0;
      let unanswered = 0;
      for (const { userId } of sortedMembers) {
        const a = responseMap.get(c.id)?.get(userId);
        if (a === undefined) unanswered += 1;
        else if (a === "yes") yes += 1;
        else if (a === "maybe") maybe += 1;
        else no += 1;
      }
      map.set(c.id, { yes, maybe, no, unanswered });
    }
    return map;
  }, [candidates, sortedMembers, responseMap]);

  function setMyDraftForCandidate(candidateId: string, answer: ScheduleAnswer) {
    setMyDraftAnswers((prev) => ({ ...prev, [candidateId]: answer }));
  }

  async function handleSaveMyAnswers() {
    if (!user || !groupId || !hasUnsavedMyAnswers) return;
    setBusy("save-answers");
    setError(null);
    try {
      for (const c of candidates) {
        const d = myDraftAnswers[c.id];
        const s = savedMyAnswer(c.id);
        if (d !== s && d !== undefined) {
          await setMyScheduleResponse(groupId, user.uid, c.id, d);
        }
      }
      await load();
      if (saveBannerTimer.current) clearTimeout(saveBannerTimer.current);
      const msg = `回答を保存しました（${new Date().toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}）`;
      setSaveBanner(msg);
      saveBannerTimer.current = setTimeout(() => setSaveBanner(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "回答の保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddCandidate() {
    if (!user || !groupId || !newStartDate.trim() || !newEndDate.trim()) return;
    setBusy("add-candidate");
    setError(null);
    try {
      const start = newStartDate.trim();
      let end = newEndDate.trim();
      if (end < start) end = start;
      await addScheduleCandidate(groupId, user.uid, start, end);
      setNewStartDate("");
      setNewEndDate("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "候補の追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveCandidate(candidateId: string) {
    if (!groupId) return;
    if (!confirm("この候補日と関連する回答を削除しますか？")) return;
    setBusy(`rm-${candidateId}`);
    setError(null);
    try {
      await removeScheduleCandidate(groupId, candidateId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function firebaseErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      const x = e as { code: string; message: string };
      return `${x.message} (${x.code})`;
    }
    return "確定に失敗しました";
  }

  async function handleConfirm(
    candidateId: string,
    startISO: string,
    endISO: string,
  ) {
    if (!user || !groupId) return;
    if (!startISO?.trim() || !endISO?.trim()) {
      setError("候補の開始日・終了日が取得できません。ページを再読み込みしてください。");
      return;
    }
    setBusy("confirm");
    setError(null);
    try {
      await setScheduleConfirm(groupId, user.uid, candidateId, startISO, endISO);
      await load();
      setSaveBanner("日程を確定しました。");
      if (saveBannerTimer.current) clearTimeout(saveBannerTimer.current);
      saveBannerTimer.current = setTimeout(() => setSaveBanner(null), 5000);
    } catch (e) {
      setError(firebaseErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirmWithDialog(
    candidateId: string,
    startISO: string,
    endISO: string,
    label: string,
  ) {
    if (
      !confirm(
        `次の候補をグループの確定日程としてよいですか？\n\n${label}`,
      )
    ) {
      return;
    }
    await handleConfirm(candidateId, startISO, endISO);
  }

  async function handleClearConfirm() {
    if (!groupId) return;
    if (!confirm("確定した日程を解除しますか？")) return;
    setBusy("clear-confirm");
    setError(null);
    try {
      await clearScheduleConfirm(groupId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  if (group === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }

  if (group === null) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">グループが見つかりません。</p>
        <Link
          href="/groups"
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
          グループ一覧へ
        </Link>
      </div>
    );
  }

  if (user && !isMember) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">
          このグループのメンバーではありません。
        </p>
        <Link
          href={`/groups/${groupId}`}
          className="mt-4 inline-block text-sm text-zinc-900 underline"
        >
          グループ詳細へ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← {group.name}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        日程調整
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        各候補で ○ / △ / × を選び、
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          「回答を保存」
        </span>
        を押すと他のメンバーにも反映されます。日程の確定はオーナーまたは管理者が行います。
      </p>

      {saveBanner ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          {saveBanner}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {config?.confirmedCandidateId &&
      config.confirmedStartDate &&
      config.confirmedEndDate ? (
        <div
          className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40"
          role="status"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              確定日程:{" "}
              {formatDateRangeLabel(
                config.confirmedStartDate,
                config.confirmedEndDate,
              )}
            </p>
            {canManage ? <VisibilityBadge kind="admin" /> : null}
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={handleClearConfirm}
              disabled={busy !== null}
              className="mt-3 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-900/60"
            >
              {busy === "clear-confirm" ? "処理中…" : "確定を解除"}
            </button>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              候補日程の追加
            </h2>
            <VisibilityBadge kind="admin" />
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            旅行のように複数日にわたる場合は、開始日と終了日を指定します。1日だけの候補は同じ日付を選んでください。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              開始日
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewStartDate(v);
                  setNewEndDate((prev) => {
                    if (!prev || prev < v) return v;
                    return prev;
                  });
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              終了日
              <input
                type="date"
                value={newEndDate}
                min={newStartDate || undefined}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <button
              type="button"
              onClick={handleAddCandidate}
              disabled={busy !== null || !newStartDate || !newEndDate}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {busy === "add-candidate" ? "追加中…" : "候補を追加"}
            </button>
          </div>

          {candidates.length > 0 ? (
            <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-700">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  日程の確定
                </h2>
                <VisibilityBadge kind="admin" />
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                下の表で選んだ候補の日程を確定します。確定済みの場合は上部に表示されます。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {candidates.map(({ id, data }) => {
                  const rangeLabel = formatDateRangeLabel(
                    data.startDate,
                    data.endDate,
                  );
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        handleConfirmWithDialog(
                          id,
                          data.startDate,
                          data.endDate,
                          rangeLabel,
                        )
                      }
                      disabled={busy !== null}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {busy === "confirm"
                        ? "…"
                        : `${rangeLabel} を確定`}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              回答一覧
            </h2>
            {canManage ? (
              <VisibilityBadge
                kind="admin"
                title="この一覧は全員に表示されます。候補ごとの「確定」「削除」リンクは管理者のみが使えます。"
              />
            ) : null}
          </div>
          {candidates.length > 0 && user && isMember ? (
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {hasUnsavedMyAnswers ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  未保存の変更があります
                </p>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  すべて保存済みです
                </p>
              )}
              <button
                type="button"
                onClick={handleSaveMyAnswers}
                disabled={busy !== null || !hasUnsavedMyAnswers}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {busy === "save-answers" ? "保存中…" : "回答を保存"}
              </button>
            </div>
          ) : null}
        </div>
        {candidates.length > 0 ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            各候補の集計は「回答を保存」済みのデータのみです。未保存の変更は反映されません。
          </p>
        ) : null}
        {candidates.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            まだ候補日がありません。オーナーまたは管理者が追加すると表示されます。
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/80">
                  <th className="sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
                    メンバー
                  </th>
                  {candidates.map(({ id, data }) => {
                    const counts = aggregateByCandidate.get(id);
                    const yes = counts?.yes ?? 0;
                    const maybe = counts?.maybe ?? 0;
                    const noCount = counts?.no ?? 0;
                    const un = counts?.unanswered ?? 0;
                    return (
                      <th
                        key={id}
                        className="min-w-[7.5rem] px-2 py-2 text-center font-medium text-zinc-700 dark:text-zinc-300"
                      >
                        <div className="flex flex-col items-stretch gap-1.5">
                          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
                            <span className="min-w-0 text-center text-[11px] font-medium leading-tight">
                              {formatDateRangeLabel(
                                data.startDate,
                                data.endDate,
                              )}
                            </span>
                            {canManage ? (
                              <span className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleConfirmWithDialog(
                                      id,
                                      data.startDate,
                                      data.endDate,
                                      formatDateRangeLabel(
                                        data.startDate,
                                        data.endDate,
                                      ),
                                    )
                                  }
                                  disabled={busy !== null}
                                  className="text-[10px] font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
                                >
                                  確定
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCandidate(id)}
                                  disabled={busy !== null}
                                  className="text-[10px] text-red-600 hover:underline disabled:opacity-50"
                                >
                                  削除
                                </button>
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-center gap-0.5 leading-tight">
                            <span className="text-[10px] font-normal text-emerald-800 dark:text-emerald-300">
                              ○ {yes}
                              <span className="text-zinc-400 dark:text-zinc-500">
                                {" "}
                                ·{" "}
                              </span>
                              <span className="text-amber-800 dark:text-amber-300">
                                △ {maybe}
                              </span>
                              <span className="text-zinc-400 dark:text-zinc-500">
                                {" "}
                                ·{" "}
                              </span>
                              <span className="text-zinc-600 dark:text-zinc-400">
                                × {noCount}
                              </span>
                            </span>
                            {un > 0 ? (
                              <span className="text-[10px] font-normal text-zinc-500">
                                未回答 {un}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map(({ userId, data: md }) => {
                  const isMe = userId === user?.uid;
                  return (
                    <tr
                      key={userId}
                      className={
                        isMe
                          ? "border-b border-zinc-100 bg-emerald-50/80 dark:border-zinc-800 dark:bg-emerald-950/30"
                          : "border-b border-zinc-100 dark:border-zinc-800"
                      }
                    >
                      <td className="sticky left-0 z-10 border-r border-zinc-200 bg-inherit px-3 py-2 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
                        {md.displayName || userId.slice(0, 8) + "…"}
                        {userId === group.ownerId ? (
                          <span className="ml-1 text-xs text-zinc-500">
                            （オーナー）
                          </span>
                        ) : null}
                        {isMe ? (
                          <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400">
                            あなた
                          </span>
                        ) : null}
                      </td>
                      {candidates.map(({ id: candId }) => {
                        const ans = responseMap.get(candId)?.get(userId);
                        const myPick = isMe
                          ? myDraftAnswers[candId] ?? savedMyAnswer(candId)
                          : undefined;
                        return (
                          <td
                            key={candId}
                            className="px-1 py-1 text-center align-middle"
                          >
                            {isMe && user ? (
                              <div className="flex flex-wrap justify-center gap-0.5">
                                {(
                                  [
                                    ["yes", "○"],
                                    ["maybe", "△"],
                                    ["no", "×"],
                                  ] as const
                                ).map(([val, label]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() =>
                                      setMyDraftForCandidate(candId, val)
                                    }
                                    disabled={busy !== null}
                                    className={`min-w-[1.75rem] rounded px-1 py-0.5 text-xs font-medium disabled:opacity-50 ${
                                      myPick === val
                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                        : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-base text-zinc-800 dark:text-zinc-200">
                                {answerSymbol(ans)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
