import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import { updateDestination } from "@/lib/firestore/groups";
import type {
  DestinationAnswer,
  DestinationCandidateDoc,
  DestinationPollDoc,
  DestinationVoteDoc,
} from "@/types/destination";
import {
  addDoc,
  collection,
  deleteDoc,
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
  polls: { title: string; decidedDestinationName: string | null }[],
): string | null {
  const parts = polls
    .filter(
      (p) =>
        typeof p.decidedDestinationName === "string" &&
        p.decidedDestinationName.trim() !== "",
    )
    .map((p) => `${p.title.trim()}: ${p.decidedDestinationName!.trim()}`);
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

export async function syncGroupDestinationSummary(groupId: string): Promise<void> {
  const polls = await listDestinationPolls(groupId);
  const summary = formatDestinationSummaryFromPolls(
    polls.map((p) => ({
      title: p.data.title,
      decidedDestinationName: p.data.decidedDestinationName,
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
  return polls.every(
    (p) =>
      typeof p.data.decidedDestinationName === "string" &&
      p.data.decidedDestinationName.trim() !== "",
  );
}

// ── レガシー（ルート直下）読み取り ─────────────────────────────

async function listLegacyDestinationCandidates(
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
  batch.set(pollRef, {
    title: "目的地",
    sortOrder: 0,
    decidedDestinationName: legacyDest?.trim() ? legacyDest.trim() : null,
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

/** オーナー／管理者が確定する。null で確定解除 */
export async function setPollDecidedDestination(
  groupId: string,
  pollId: string,
  destinationName: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationPolls, pollId),
    {
      decidedDestinationName: destinationName?.trim() || null,
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

export async function castDestinationVote(
  groupId: string,
  pollId: string,
  uid: string,
  candidateId: string,
  answer: DestinationAnswer,
): Promise<void> {
  const db = getFirebaseFirestore();
  const docId = `${uid}_${candidateId}`;
  await setDoc(
    doc(
      db,
      COLLECTIONS.groups,
      groupId,
      SUB.destinationPolls,
      pollId,
      SUB.destinationVotes,
      docId,
    ),
    {
      candidateId,
      userId: uid,
      answer,
      updatedAt: serverTimestamp(),
    },
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
