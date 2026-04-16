import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type {
  DestinationAnswer,
  DestinationCandidateDoc,
  DestinationVoteDoc,
} from "@/types/destination";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

export type CandidateItem = { id: string; data: DestinationCandidateDoc };
export type VoteItem = { id: string; data: DestinationVoteDoc };

/** 目的地候補一覧を取得 */
export async function listDestinationCandidates(
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

/** 目的地候補を追加 */
export async function addDestinationCandidate(
  groupId: string,
  uid: string,
  displayName: string | null,
  params: { name: string; url: string | null; costPerNight: number; description: string | null },
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = collection(
    db,
    COLLECTIONS.groups,
    groupId,
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

/** 目的地候補を編集 */
export async function updateDestinationCandidate(
  groupId: string,
  candidateId: string,
  params: { name: string; url: string | null; costPerNight: number; description: string | null },
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationCandidates, candidateId),
    { ...params },
  );
}

/** 目的地候補を削除 */
export async function deleteDestinationCandidate(
  groupId: string,
  candidateId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationCandidates, candidateId),
  );
}

/** 投票一覧を取得 */
export async function listDestinationVotes(
  groupId: string,
): Promise<VoteItem[]> {
  const db = getFirebaseFirestore();
  const ref = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.destinationVotes,
  );
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as DestinationVoteDoc }));
}

/** 投票する（上書き保存） */
export async function castDestinationVote(
  groupId: string,
  uid: string,
  candidateId: string,
  answer: DestinationAnswer,
): Promise<void> {
  const db = getFirebaseFirestore();
  const docId = `${uid}_${candidateId}`;
  await setDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationVotes, docId),
    { candidateId, userId: uid, answer, updatedAt: serverTimestamp() },
  );
}

/** 候補への投票を削除（取り消し） */
export async function deleteDestinationVote(
  groupId: string,
  uid: string,
  candidateId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const docId = `${uid}_${candidateId}`;
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.destinationVotes, docId),
  );
}
