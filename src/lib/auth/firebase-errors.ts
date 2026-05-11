/**
 * Firebase Auth のエラーコードを日本語メッセージに変換する
 */
export function mapAuthError(code: string | undefined): string {
  if (!code) return "認証に失敗しました。";

  const map: Record<string, string> = {
    "auth/email-already-in-use": "このメールアドレスは既に登録されています。",
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/invalid-credential": "メールアドレスまたはパスワードが正しくありません。",
    "auth/user-disabled": "このアカウントは無効になっています。",
    "auth/user-not-found": "アカウントが見つかりません。",
    "auth/wrong-password": "パスワードが正しくありません。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/too-many-requests": "試行回数が多すぎます。しばらくしてから再度お試しください。",
    "auth/timeout-client":
      "接続がタイムアウトしました。通信状況を確認し、もう一度お試しください。",
  };

  return map[code] ?? "認証に失敗しました。もう一度お試しください。";
}
