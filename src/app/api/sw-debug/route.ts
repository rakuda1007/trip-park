import { NextRequest, NextResponse } from "next/server";

/**
 * Service Worker のデバッグ用エンドポイント。
 * push イベントが SW で発火したかどうかを Firebase App Hosting のログで確認するために使う。
 * 確認後に削除予定。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  console.log("[sw-debug] push event fired:", JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
