import { getAdminApp, getAdminFirestore } from "@/lib/firebase/admin";
import { NextRequest, NextResponse } from "next/server";

export type NotifyStatusResponse = {
  /** userId → デバイス（FCMトークン）登録数 */
  deviceCounts: Record<string, number>;
};

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  // 呼び出し元の認証確認
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = await getAdminApp().auth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    const db = getAdminFirestore();

    // 呼び出し元がオーナー or 管理者かチェック
    const callerMemberSnap = await db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .doc(callerUid)
      .get();
    if (!callerMemberSnap.exists) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const callerRole = (callerMemberSnap.data() as { role?: string })?.role;
    if (callerRole !== "owner" && callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // グループメンバー一覧を取得
    const membersSnap = await db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .get();
    const memberUids = membersSnap.docs.map((d) => d.id);

    // 各ユーザーの FCM トークン数を取得
    const deviceCounts: Record<string, number> = {};
    await Promise.all(
      memberUids.map(async (uid) => {
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) {
          deviceCounts[uid] = 0;
          return;
        }
        const tokens = (userSnap.data() as { fcmTokens?: string[] })?.fcmTokens ?? [];
        deviceCounts[uid] = tokens.length;
      }),
    );

    return NextResponse.json({ deviceCounts } satisfies NotifyStatusResponse);
  } catch (err) {
    console.error("[/api/admin/notify-status] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
