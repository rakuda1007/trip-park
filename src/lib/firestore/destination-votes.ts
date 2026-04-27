import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import { updateDestination } from "@/lib/firestore/groups";
import type {
  DestinationCandidateDoc,
  DestinationPollDoc,
  DestinationVoteDoc,
} from "@/types/destination";
import {
  DESTINATION_DECIDE_MAX_PER_POLL,
  DESTINATION_WANT_VOTES_MAX_PER_USER,
} from "@/types/destination";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

export type PollItem = { id: string; data: DestinationPollDoc };

/** 投票ブロック doc から確定済み目的地名の配列（重複除去・最大件数まで） */
export function normalizeDecidedNamesFromPollDoc(
  data: DestinationPollDoc,
): string[] {
  const raw = data.decidedDestinationNames;
  if (Array.isArray(raw) && raw.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of raw) {
      const t = typeof s === "string" ? s.trim() : "";
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= DESTINATION_DECIDE_MAX_PER_POLL) break;
    }
    return out;
  }
  const single = data.decidedDestinationName?.trim();
  return single ? [single] : [];
}
export type CandidateItem = { id: string; data: DestinationCandidateDoc };
export type VoteItem = { id: string; data: DestinationVoteDoc };

function pollsCollection(groupId: string) {
  const db = getFirebaseFirestore();
  return collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationPolls,
  );
}

function candidatesCollection(groupId: string, pollId: string) {
  const db = getFirebaseFirestore();
  return collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationPolls,
    pollId,
    SUB.destinationCandidates,
  );
}

function votesCollection(groupId: string, pollId: string) {
  const db = getFirebaseFirestore();
  return collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationPolls,
    pollId,
    SUB.destinationVotes,
  );
}

/** グループ doc の destination に書き込む要約文（旅程ナビ・一覧用） */
export function formatDestinationSummaryFromPolls(
  polls: { title: string; decidedNames: string[] }[],
): string | null {
  const parts = polls
    .filter((p) => p.decidedNames.length > 0)
    .map((p) => `${p.title.trim()}: ${p.decidedNames.join("、")}`);
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

export async function syncGroupDestinationSummary(groupId: string): Promise<void> {
  const polls = await listDestinationPolls(groupId);
  const summary = formatDestinationSummaryFromPolls(
    polls.map((p) => ({
      title: p.data.title,
      decidedNames: normalizeDecidedNamesFromPollDoc(p.data),
    })),
  );
  await updateDestination(groupId, summary);
}

/**
 * 目的地ステップ完了: 投票ブロックが1件以上あり、すべてに確定目的地がある。
 * レガシー（destinationPolls がまだ無く groups.destination のみ）も true とみなす。
 */
export async function isDestinationStepComplete(
  groupId: string,
  legacyDestination: string | null | undefined,
): Promise<boolean> {
  const polls = await listDestinationPolls(groupId);
  if (polls.length === 0) {
    return !!legacyDestination?.trim();
  }
  return polls.every((p) => normalizeDecidedNamesFromPollDoc(p.data).length > 0);
}

// ── レガシー（ルート直下）読み取り ─────────────────────────────

/** レガシー候補が残っているか（移行案内表示用） */
export async function listLegacyDestinationCandidates(
  groupId: string,
): Promise<CandidateItem[]> {
  const db = getFirebaseFirestore();
  const ref = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationCandidates,
  );
  const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as DestinationCandidateDoc,
  }));
}

async function listLegacyDestinationVotes(groupId: string): Promise<VoteItem[]> {
  const db = getFirebaseFirestore();
  const ref = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationVotes,
  );
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as DestinationVoteDoc,
  }));
}

/**
 * 旧データ（groups/.../destinationCandidates）を destinationPolls 配下へ1回だけ移行する。
 */
export async function migrateLegacyDestinationPollIfNeeded(
  groupId: string,
  uid: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const pollsSnap = await getDocs(pollsCollection(groupId));
  if (!pollsSnap.empty) return;

  // 移行は他ユーザーの候補・投票を一括書き込みするため、オーナー／管理者のみ（ルールと整合）
  const memberSnap = await getDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.members, uid),
  );
  const role = memberSnap.exists()
    ? ((memberSnap.data() as { role?: string }).role ?? "member")
    : null;
  if (role !== "owner" && role !== "admin") {
    return;
  }

  const [legacyCandidates, legacyVotes, groupSnap] = await Promise.all([
    listLegacyDestinationCandidates(groupId),
    listLegacyDestinationVotes(groupId),
    getDoc(doc(db, COLLECTIONS.groups, groupId)),
  ]);

  const legacyDest = groupSnap.exists()
    ? ((groupSnap.data() as { destination?: string | null }).destination ?? null)
    : null;

  if (legacyCandidates.length === 0 && !legacyDest?.trim()) return;

  const pollRef = doc(pollsCollection(groupId));
  const batch = writeBatch(db);
  const legacyNames =
    legacyDest?.trim() && legacyDest.trim().length > 0
      ? [legacyDest.trim()]
      : [];
  batch.set(pollRef, {
    title: "目的地",
    sortOrder: 0,
    decidedDestinationName: legacyNames[0] ?? null,
    decidedDestinationNames: legacyNames,
    createdByUserId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const idMap = new Map<string, string>();

  for (const c of legacyCandidates) {
    const newCandRef = doc(candidatesCollection(groupId, pollRef.id));
    idMap.set(c.id, newCandRef.id);
    batch.set(newCandRef, {
      name: c.data.name,
      url: c.data.url,
      costPerNight: c.data.costPerNight,
      description: c.data.description,
      proposedByUserId: c.data.proposedByUserId,
      proposedByDisplayName: c.data.proposedByDisplayName,
      createdAt: c.data.createdAt ?? serverTimestamp(),
    });
  }

  for (const v of legacyVotes) {
    const newCid = idMap.get(v.data.candidateId);
    if (!newCid) continue;
    const voteDocId = `${v.data.userId}_${newCid}`;
    const voteRef = doc(votesCollection(groupId, pollRef.id), voteDocId);
    batch.set(voteRef, {
      candidateId: newCid,
      userId: v.data.userId,
      answer: v.data.answer,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  for (const c of legacyCandidates) {
    await deleteDoc(
      doc(
        db,
        COLLECTIONS.groups,
        groupId,
        SUB.destinationCandidates,
        c.id,
      ),
    ).catch(() => {});
  }
  for (const v of legacyVotes) {
    await deleteDoc(
      doc(db, COLLECTIONS.groups, groupId, SUB.destinationVotes, v.id),
    ).catch(() => {});
  }

  await syncGroupDestinationSummary(groupId);
}

// ── 投票ブロック ─────────────────────────────

export async function listDestinationPolls(groupId: string): Promise<PollItem[]> {
  const snap = await getDocs(
    query(pollsCollection(groupId), orderBy("sortOrder", "asc")),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as DestinationPollDoc,
  }));
}

export async function addDestinationPoll(
  groupId: string,
  uid: string,
  params: { title: string; sortOrder: number },
): Promise<string> {
  const ref = await addDoc(pollsCollection(groupId), {
    title: params.title.trim(),
    sortOrder: params.sortOrder,
    decidedDestinationName: null,
    decidedDestinationNames: [],
    createdByUserId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await syncGroupDestinationSummary(groupId);
  return ref.id;
}

export async function updateDestinationPollMeta(
  groupId: string,
  pollId: string,
  params: { title: string; sortOrder: number },
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationPolls, pollId),
    {
      title: params.title.trim(),
      sortOrder: params.sortOrder,
      updatedAt: serverTimestamp(),
    },
  );
  await syncGroupDestinationSummary(groupId);
}

/**
 * オーナー／管理者が確定リストを保存する。
 * null または空配列で確定解除。名前は最大 DESTINATION_DECIDE_MAX_PER_POLL 件。
 */
export async function setPollDecidedDestinationNames(
  groupId: string,
  pollId: string,
  names: string[] | null,
): Promise<void> {
  const normalized =
    names == null
      ? []
      : [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(
          0,
          DESTINATION_DECIDE_MAX_PER_POLL,
        );
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationPolls, pollId),
    {
      decidedDestinationNames: normalized,
      decidedDestinationName: normalized.length > 0 ? normalized[0]! : null,
      updatedAt: serverTimestamp(),
    },
  );
  await syncGroupDestinationSummary(groupId);
}

export async function deleteDestinationPoll(
  groupId: string,
  pollId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const candSnap = await getDocs(candidatesCollection(groupId, pollId));
  const voteSnap = await getDocs(votesCollection(groupId, pollId));
  await Promise.all([
    ...candSnap.docs.map((d) => deleteDoc(d.ref)),
    ...voteSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationPolls, pollId),
  );
  await syncGroupDestinationSummary(groupId);
}

// ── 候補・投票（poll 配下） ─────────────────────────────

export async function listDestinationCandidates(
  groupId: string,
  pollId: string,
): Promise<CandidateItem[]> {
  const ref = candidatesCollection(groupId, pollId);
  const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as DestinationCandidateDoc,
  }));
}

export async function addDestinationCandidate(
  groupId: string,
  pollId: string,
  uid: string,
  displayName: string | null,
  params: {
    name: string;
    url: string | null;
    costPerNight: number;
    description: string | null;
  },
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationPolls,
    pollId,
    SUB.destinationCandidates,
  );
  const docRef = await addDoc(ref, {
    ...params,
    proposedByUserId: uid,
    proposedByDisplayName: displayName,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateDestinationCandidate(
  groupId: string,
  pollId: string,
  candidateId: string,
  params: {
    name: string;
    url: string | null;
    costPerNight: number;
    description: string | null;
  },
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(
      db,
      COLLECTIONS.groups,
      groupId,
      SUB.destinationPolls,
      pollId,
      SUB.destinationCandidates,
      candidateId,
    ),
    { ...params },
  );
}

export async function deleteDestinationCandidate(
  groupId: string,
  pollId: string,
  candidateId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(
      db,
      COLLECTIONS.groups,
      groupId,
      SUB.destinationPolls,
      pollId,
      SUB.destinationCandidates,
      candidateId,
    ),
  );
}

export async function listDestinationVotes(
  groupId: string,
  pollId: string,
): Promise<VoteItem[]> {
  const ref = votesCollection(groupId, pollId);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as DestinationVoteDoc,
  }));
}

/**
 * 旧 answer 付き or 新 count から「行きたい」相当の票の数（0〜3）を得る
 */
export function wantVoteWeightFromDoc(data: DestinationVoteDoc): number {
  if (typeof data.count === "number" && !Number.isNaN(data.count)) {
    return Math.max(
      0,
      Math.min(3, Math.floor(data.count)),
    );
  }
  if (data.answer === "first" || data.answer === "want") return 1;
  if (data.answer === "reserve") return 0;
  return 0;
}

/**
 * 同一投票ブロック内で、1 ユーザーが既に他候補に入れた合計
 */
function sumMyWantVotesOnOtherCandidates(
  uid: string,
  candidateId: string,
  votes: VoteItem[],
): number {
  return votes
    .filter(
      (v) => v.data.userId === uid && v.data.candidateId !== candidateId,
    )
    .reduce((s, v) => s + wantVoteWeightFromDoc(v.data), 0);
}

/**
 * 当該候補の「行きたい」票（0 削除 / 1〜3）。ブロック内で 1 人合計 3 票まで。
 */
export async function setDestinationWantCount(
  groupId: string,
  pollId: string,
  uid: string,
  candidateId: string,
  count: number,
  currentPollVotes: VoteItem[],
): Promise<void> {
  const c = Math.floor(count);
  if (c < 0 || c > DESTINATION_WANT_VOTES_MAX_PER_USER) {
    throw new Error(
      `1候補あたり0〜${String(DESTINATION_WANT_VOTES_MAX_PER_USER)}票です`,
    );
  }
  const otherSum = sumMyWantVotesOnOtherCandidates(
    uid,
    candidateId,
    currentPollVotes,
  );
  if (otherSum + c > DESTINATION_WANT_VOTES_MAX_PER_USER) {
    throw new Error(
      `1人あたりこのブロックで「行きたい」は合計${String(DESTINATION_WANT_VOTES_MAX_PER_USER)}票までです`,
    );
  }

  const db = getFirebaseFirestore();
  const docId = `${uid}_${candidateId}`;
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationPolls,
    pollId,
    SUB.destinationVotes,
    docId,
  );

  if (c === 0) {
    const exist = currentPollVotes.find(
      (v) => v.data.userId === uid && v.data.candidateId === candidateId,
    );
    if (exist) await deleteDoc(ref);
    return;
  }

  await setDoc(
    ref,
    {
      candidateId,
      userId: uid,
      count: c,
      updatedAt: serverTimestamp(),
      answer: deleteField(),
    },
    { merge: true },
  );
}

export async function deleteDestinationVote(
  groupId: string,
  pollId: string,
  uid: string,
  candidateId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const docId = `${uid}_${candidateId}`;
  await deleteDoc(
    doc(
      db,
      COLLECTIONS.groups,
      groupId,
      SUB.destinationPolls,
      pollId,
      SUB.destinationVotes,
      docId,
    ),
  );
}
