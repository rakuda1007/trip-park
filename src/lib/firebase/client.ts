import "client-only";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";
import { type FirebaseStorage, getStorage } from "firebase/storage";
import { getFirebasePublicConfig } from "./env";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

/**
 * ブラウザ専用。Server Component から import しないこと。
 */
export function getFirebaseApp(): FirebaseApp {
  const config = getFirebasePublicConfig();
  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error(
      "Firebase の環境変数が不足しています。.env.local を確認してください。",
    );
  }

  if (!getApps().length) {
    app = initializeApp(config);
  }

  return app ?? getApps()[0]!;
}

/**
 * PWA／スタンドアロンでもセッションが読み取りやすいよう IndexedDB を優先し、
 * 失敗時は従来のローカル永続化にフォールバックする。
 */
export function getFirebaseAuth(): Auth {
  const firebaseApp = getFirebaseApp();
  if (auth) return auth;
  try {
    auth = initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
