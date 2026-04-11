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
  const snap = await getDocs(query(col, orderBy("sortOrder", "asc")));
  const out: { id: string; data: TripRouteDoc }[] = [];
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    out.push({
      id: d.id,
      data: {
        ...(raw as TripRouteDoc),
        waypoints: normalizeWaypoints(raw.waypoints),
      },
    });
  });
  return out;
}

export type TripRouteInput = {
  routeLabel: string | null;
  title: string;
  destinationName: string;
  destinationAddress: string | null;
  destinationMemo: string | null;
  destinationMapUrl: string | null;
  waypoints: TripWaypoint[];
  routeMapUrl: string | null;
  sortOrder: number;
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
    routeLabel: input.routeLabel,
    title: input.title.trim(),
    destinationName: input.destinationName.trim(),
    destinationAddress: input.destinationAddress?.trim() || null,
    destinationMemo: input.destinationMemo?.trim() || null,
    destinationMapUrl: input.destinationMapUrl?.trim() || null,
    waypoints: normalizeWaypoints(input.waypoints),
    routeMapUrl: input.routeMapUrl?.trim() || null,
    sortOrder: input.sortOrder,
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
    routeLabel: input.routeLabel,
    title: input.title.trim(),
    destinationName: input.destinationName.trim(),
    destinationAddress: input.destinationAddress?.trim() || null,
    destinationMemo: input.destinationMemo?.trim() || null,
    destinationMapUrl: input.destinationMapUrl?.trim() || null,
    waypoints: normalizeWaypoints(input.waypoints),
    routeMapUrl: input.routeMapUrl?.trim() || null,
    sortOrder: input.sortOrder,
    updatedAt: serverTimestamp(),
  });
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
