import "server-only";

import * as admin from "firebase-admin";

/**
 * Firebase Admin SDK のシングルトン初期化。
 * Firebase App Hosting（Google Cloud 環境）ではデフォルト認証情報を自動検出。
 * ローカル開発では GOOGLE_APPLICATION_CREDENTIALS 環境変数にサービスアカウント JSON パスを設定するか、
 * FIREBASE_ADMIN_CREDENTIALS_JSON 環境変数に JSON 文字列を設定してください。
 */
export function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  // ローカル開発用: 環境変数からサービスアカウント資格情報を読む
  const credentialsJson = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (credentialsJson) {
    try {
      const serviceAccount = JSON.parse(credentialsJson);
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    } catch {
      // JSON parse failure → fall through to default credentials
    }
  }

  // Google Cloud 環境（Firebase App Hosting）ではデフォルト認証情報を使用
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function getAdminFirestore(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

export function getAdminMessaging(): admin.messaging.Messaging {
  return getAdminApp().messaging();
}
