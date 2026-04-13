import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS, SUB } from "@/lib/firestore/collections";
import type { TripRouteDoc, TripWaypoint } from "@/types/trip";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

function normalizeWaypoints(raw: unknown): TripWaypoint[] {
  if (!Array.isArray(raw)) return [];
  const out: TripWaypoint[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      memo: typeof o.memo === "string" ? o.memo : null,
      mapUrl: typeof o.mapUrl === "string" ? o.mapUrl : null,
    });
  }
  return out;
}

export async function listTripRoutes(groupId: string): Promise<
  { id: string; data: TripRouteDoc }[]
> {
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.tripRoutes);
  const snap = await getDocs(query(col, orderBy("dayNumber", "asc")));
  const out: { id: string; data: TripRouteDoc }[] = [];
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    out.push({
      id: d.id,
        data: {
        ...(raw as TripRouteDoc),
        waypoints: normalizeWaypoints(raw.waypoints),
        isDone: raw.isDone === true,
        dayNumber: typeof raw.dayNumber === "number" ? raw.dayNumber : (raw.sortOrder as number ?? 0) + 1,
        memo: typeof raw.memo === "string" ? raw.memo : (raw.destinationMemo as string | null ?? null),
        departurePoint: typeof raw.departurePoint === "string" ? raw.departurePoint : null,
        departureMapUrl: typeof raw.departureMapUrl === "string" ? raw.departureMapUrl : null,
      },
    });
  });
  return out;
}

export type TripRouteInput = {
  dayNumber: number;
  departurePoint: string | null;
  departureMapUrl: string | null;
  destinationName: string;
  destinationMapUrl: string | null;
  waypoints: TripWaypoint[];
  routeMapUrl: string | null;
  memo: string | null;
  isDone: boolean;
};

export async function addTripRoute(
  groupId: string,
  uid: string,
  displayName: string | null,
  input: TripRouteInput,
): Promise<string> {
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.tripRoutes);
  const ref = await addDoc(col, {
    dayNumber: input.dayNumber,
    departurePoint: input.departurePoint?.trim() || null,
    departureMapUrl: input.departureMapUrl?.trim() || null,
    destinationName: input.destinationName.trim(),
    destinationMapUrl: input.destinationMapUrl?.trim() || null,
    waypoints: normalizeWaypoints(input.waypoints),
    routeMapUrl: input.routeMapUrl?.trim() || null,
    memo: input.memo?.trim() || null,
    isDone: input.isDone,
    sortOrder: input.dayNumber,
    // legacy fields for backward compat with rules
    routeLabel: null,
    title: `Day ${input.dayNumber}`,
    destinationAddress: null,
    destinationMemo: input.memo?.trim() || null,
    createdByUserId: uid,
    createdByDisplayName: displayName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTripRoute(
  groupId: string,
  routeId: string,
  input: TripRouteInput,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = doc(db, COLLECTIONS.groups, groupId, SUB.tripRoutes, routeId);
  await updateDoc(ref, {
    dayNumber: input.dayNumber,
    departurePoint: input.departurePoint?.trim() || null,
    departureMapUrl: input.departureMapUrl?.trim() || null,
    destinationName: input.destinationName.trim(),
    destinationMapUrl: input.destinationMapUrl?.trim() || null,
    waypoints: normalizeWaypoints(input.waypoints),
    routeMapUrl: input.routeMapUrl?.trim() || null,
    memo: input.memo?.trim() || null,
    isDone: input.isDone,
    sortOrder: input.dayNumber,
    // legacy
    routeLabel: null,
    title: `Day ${input.dayNumber}`,
    destinationAddress: null,
    destinationMemo: input.memo?.trim() || null,
    updatedAt: serverTimestamp(),
  });
}

export async function updateDayDone(
  groupId: string,
  routeId: string,
  isDone: boolean,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.tripRoutes, routeId),
    { isDone, updatedAt: serverTimestamp() },
  );
}


export async function deleteTripRoute(
  groupId: string,
  routeId: string,
): Promise<void> {
  const db = getFirebaseFirestore();
  await deleteDoc(
    doc(db, COLLECTIONS.groups, groupId, SUB.tripRoutes, routeId),
  );
}

/** 指定した dayNumber のルートが既に存在するか確認 */
export async function dayRouteExists(
  groupId: string,
  dayNumber: number,
): Promise<boolean> {
  const db = getFirebaseFirestore();
  const col = collection(db, COLLECTIONS.groups, groupId, SUB.tripRoutes);
  const snap = await getDocs(query(col, where("dayNumber", "==", dayNumber)));
  return !snap.empty;
}
