import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { COLLECTIONS } from "./collections";

export function userDocRef(db: Firestore, uid: string) {
  return doc(db, COLLECTIONS.users, uid);
}

/**
 * ログイン直後に呼び出し、users/{uid} を作成または更新する。
 */
export async function ensureUserDocument(
  uid: string,
  email: string | null,
  displayName: string | null,
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = userDocRef(db, uid);
  const snap = await getDoc(ref);

  const base = {
    email,
    displayName,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

export async function updateUserProfileFields(
  uid: string,
  fields: { displayName: string | null },
): Promise<void> {
  const db = getFirebaseFirestore();
  const ref = userDocRef(db, uid);
  await setDoc(
    ref,
    {
      displayName: fields.displayName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
