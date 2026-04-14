import { getAdminFirestore, getAdminMessaging } from "@/lib/firebase/admin";
import { NextRequest, NextResponse } from "next/server";

export type NotifyPayload =
  | {
      type: "bulletin_topic";
      groupId: string;
      groupName: string;
      topicId: string;
      topicTitle: string;
      authorName: string;
      authorUid: string;
    }
  | {
      type: "bulletin_reply";
      groupId: string;
      groupName: string;
      topicId: string;
      topicTitle: string;
      authorName: string;
      authorUid: string;
      topicAuthorUid: string;
    }
  | {
      type: "schedule_confirmed";
      groupId: string;
      groupName: string;
      startDate: string;
      endDate: string | null;
      confirmedByUid: string;
    };

/** グループの全メンバー（除外 UID を除く）の FCM トークンを収集する */
async function collectTokens(groupId: string, excludeUids: string[]): Promise<string[]> {
  const db = getAdminFirestore();

  // メンバー一覧を取得
  const membersSnap = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .get();

  const targetUids: string[] = membersSnap.docs
    .map((d) => d.id)
    .filter((uid) => !excludeUids.includes(uid));

  if (targetUids.length === 0) return [];

  // 各ユーザーの fcmTokens を収集
  const tokens: string[] = [];
  await Promise.all(
    targetUids.map(async (uid) => {
      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists) return;
      const data = userSnap.data() as { fcmTokens?: string[] } | undefined;
      const userTokens = data?.fcmTokens ?? [];
      tokens.push(...userTokens);
    }),
  );

  const unique = [...new Set(tokens)];
  console.log(`[notify] collectTokens groupId=${groupId} targetUids=${targetUids.length} tokens=${unique.length}`);
  return unique;
}

/** 無効なトークンを Firestore から削除する */
async function removeInvalidTokens(invalidTokens: string[]): Promise<void> {
  if (invalidTokens.length === 0) return;
  const db = getAdminFirestore();
  const usersSnap = await db.collection("users").get();
  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const data = userDoc.data() as { fcmTokens?: string[] };
      const currentTokens = data.fcmTokens ?? [];
      const cleaned = currentTokens.filter((t) => !invalidTokens.includes(t));
      if (cleaned.length !== currentTokens.length) {
        await userDoc.ref.update({ fcmTokens: cleaned });
      }
    }),
  );
}

/** 複数の FCM トークンへ通知を送信する */
async function sendMulticast(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;
  const messaging = getAdminMessaging();

  // FCM は一度に 500 トークンまで
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    chunks.push(tokens.slice(i, i + 500));
  }

  const invalidTokens: string[] = [];

  // notification フィールドを含める。
  // data-only だと iOS APNs が content-available=1 (background push) として扱い、
  // iOS がプッシュイベントを確実に起動しない。alert push にするために必要。
  // SW 側は Firebase SDK を使わない raw push ハンドラなので重複表示は起きない。
  const payload = { ...data, _title: title, _body: body };

  for (const chunk of chunks) {
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      data: payload,
      webpush: {
        headers: { Urgency: "high" },
        fcmOptions: { link: data.url ?? "/" },
      },
    });

    console.log(`[notify] successCount=${response.successCount} failureCount=${response.failureCount}`);

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code ?? "";
        const errMsg = resp.error?.message ?? "";
        console.warn(`[notify] token[${idx}] failed: code=${errCode} msg=${errMsg} token=${chunk[idx]?.slice(0, 20)}...`);
        if (
          errCode === "messaging/invalid-registration-token" ||
          errCode === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(chunk[idx]!);
        }
      } else {
        console.log(`[notify] token[${idx}] sent OK (msgId=${resp.messageId?.slice(0, 30)}...)`);
      }
    });
  }

  // 非同期でクリーンアップ（レスポンスには影響しない）
  removeInvalidTokens(invalidTokens).catch(() => {});
}

export async function POST(req: NextRequest) {
  let payload: NotifyPayload;
  try {
    payload = (await req.json()) as NotifyPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 呼び出し元の認証確認
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getAdminApp } = await import("@/lib/firebase/admin");
    const decoded = await getAdminApp().auth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    if (payload.type === "bulletin_topic") {
      const { groupId, groupName, topicId, topicTitle, authorName, authorUid } = payload;
      if (callerUid !== authorUid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const tokens = await collectTokens(groupId, []);
      await sendMulticast(
        tokens,
        `📣 ${groupName}`,
        `${authorName}さんが「${topicTitle}」を投稿しました`,
        { url: `/groups/${groupId}/bulletin/${topicId}`, type: "bulletin_topic" },
      );
    } else if (payload.type === "bulletin_reply") {
      const { groupId, groupName, topicId, topicTitle, authorName, authorUid, topicAuthorUid } = payload;
      if (callerUid !== authorUid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // 話題の作者と返信者本人に通知（重複は Set で除去）
      const notifyUids = [...new Set([topicAuthorUid, authorUid])];
      if (notifyUids.length === 0) {
        return NextResponse.json({ ok: true });
      }
      const tokens: string[] = [];
      const db = getAdminFirestore();
      for (const uid of notifyUids) {
        const snap = await db.collection("users").doc(uid).get();
        const data = snap.data() as { fcmTokens?: string[] } | undefined;
        tokens.push(...(data?.fcmTokens ?? []));
      }
      await sendMulticast(
        [...new Set(tokens)],
        `💬 ${groupName}`,
        `${authorName}さんが「${topicTitle}」に返信しました`,
        { url: `/groups/${groupId}/bulletin/${topicId}`, type: "bulletin_reply" },
      );
    } else if (payload.type === "schedule_confirmed") {
      const { groupId, groupName, startDate, endDate, confirmedByUid } = payload;
      if (callerUid !== confirmedByUid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const tokens = await collectTokens(groupId, []);
      const dateText = endDate ? `${startDate} 〜 ${endDate}` : startDate;
      await sendMulticast(
        tokens,
        `📅 ${groupName}`,
        `日程が確定しました（${dateText}）`,
        { url: `/groups/${groupId}`, type: "schedule_confirmed" },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/notify] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
