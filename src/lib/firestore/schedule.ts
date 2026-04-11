import { getFirebaseFirestore } from "@/lib/firebase/client";
import {
  COLLECTIONS,
  SCHEDULE_CONFIG_DOC,
  SUB,
} from "@/lib/firestore/collections";
import type {
  ScheduleAnswer,
  ScheduleCandidateDoc,
  ScheduleConfigDoc,
  ScheduleResponseDoc,
} from "@/types/schedule";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

export function scheduleResponseDocId(userId: string, candidateId: string) {
  return `${userId}_${candidateId}`;
}

export function normalizeScheduleCandidateDoc(
  raw: Record<string, unknown>,
): ScheduleCandidateDoc {
  const r = raw as ScheduleCandidateDoc & { date?: string };
  if (typeof r.startDate === "string" && typeof r.endDate === "string") {
    return {
      startDate: r.startDate,
      endDate: r.endDate,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    };
  }
  if (typeof r.date === "string") {
    return {
      startDate: r.date,
      endDate: r.date,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    };
  }
  throw new Error("Invalid schedule candidate");
}

export function normalizeScheduleConfig(
  data: ScheduleConfigDoc | null,
): ScheduleConfigDoc | null {
  if (!data) return null;
  const start = data.confirmedStartDate ?? data.confirmedDate ?? null;
  const end = data.confirmedEndDate ?? data.confirmedDate ?? null;
  return {
    ...data,
    confirmedStartDate: start,
    confirmedEndDate: end,
  };
}

export async function getScheduleConfig(
  groupId: string,
): Promise<ScheduleConfigDoc | null> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.config,
    SCHEDULE_CONFIG_DOC,
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeScheduleConfig(snap.data() as ScheduleConfigDoc);
}

export async function listScheduleCandidates(groupId: string): Promise<
  { id: string; data: ScheduleCandidateDoc }[]
> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.scheduleCandidates,
  );
  const snap = await getDocs(query(col, orderBy("date", "asc")));
  const out: { id: string; data: ScheduleCandidateDoc }[] = [];
  snap.forEach((d) => {
    try {
      out.push({
        id: d.id,
        data: normalizeScheduleCandidateDoc(d.data() as Record<string, unknown>),
      });
    } catch {
      /* 不正な旧ドキュメントはスキップ */
    }
  });
  return out;
}

export async function listScheduleResponses(groupId: string): Promise<
  { id: string; data: ScheduleResponseDoc }[]
> {
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.scheduleResponses,
  );
  const snap = await getDocs(col);
  const out: { id: string; data: ScheduleResponseDoc }[] = [];
  snap.forEach((d) =>
    out.push({ id: d.id, data: d.data() as ScheduleResponseDoc }),
  );
  return out;
}

export async function addScheduleCandidate(
  groupId: string,
  actorUid: string,
  startDateISO: string,
  endDateISO: string,
): Promise<string> {
  if (endDateISO < startDateISO) {
    throw new Error("終了日は開始日以降にしてください。");
  }
  const db = getFirebaseFirestore();
  const col = collection(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.scheduleCandidates,
  );
  const ref = await addDoc(col, {
    date: startDateISO,
    startDate: startDateISO,
    endDate: endDateISO,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
  });
  return ref.id;
}

export async function removeScheduleCandidate(
  groupId: string,
  candidateId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  const responses = await listScheduleResponses(groupId);
  const batch = writeBatch(db);
  for (const r of responses) {
    if (r.data.candidateId === candidateId) {
      batch.delete(
        doc(
          db,
          COLLECTIONS.groups,
          groupId,
          SUB.scheduleResponses,
          r.id,
        ),
      );
    }
  }
  batch.delete(
    doc(
      db,
      COLLECTIONS.groups,
      groupId,
      SUB.scheduleCandidates,
      candidateId,
    ),
  );
  await batch.commit();

  const cfg = await getScheduleConfig(groupId);
  if (cfg?.confirmedCandidateId === candidateId) {
    await clearScheduleConfirm(groupId);
  }
}

export async function setMyScheduleResponse(
  groupId: string,
  userId: string,
  candidateId: string,
  answer: ScheduleAnswer,
): Promise<void> {
  const db = getFirebaseFirestore();
  const id = scheduleResponseDocId(userId, candidateId);
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.scheduleResponses,
    id,
  );
  await setDoc(ref, {
    userId,
    candidateId,
    answer,
    updatedAt: serverTimestamp(),
  });
}

export async function setScheduleConfirm(
  groupId: string,
  actorUid: string,
  candidateId: string,
  startDateISO: string,
  endDateISO: string,
): Promise<void> {
  if (!startDateISO?.trim() || !endDateISO?.trim()) {
    throw new Error("候補の開始日・終了日が不正です。");
  }
  if (endDateISO < startDateISO) {
    throw new Error("終了日は開始日以降にしてください。");
  }
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.config,
    SCHEDULE_CONFIG_DOC,
  );
  await setDoc(ref, {
    confirmedCandidateId: candidateId,
    confirmedStartDate: startDateISO,
    confirmedEndDate: endDateISO,
    confirmedAt: serverTimestamp(),
    confirmedBy: actorUid,
    confirmedDate: null,
  });
}

export async function clearScheduleConfirm(groupId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(
    db,
    COLLECTIONS.groups,
    groupId,
    SUB.config,
    SCHEDULE_CONFIG_DOC,
  );
  await setDoc(ref, {
    confirmedCandidateId: null,
    confirmedStartDate: null,
    confirmedEndDate: null,
    confirmedDate: null,
    confirmedAt: null,
    confirmedBy: null,
  });
}
