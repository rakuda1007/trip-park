"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/env";
import { clearLastTripId } from "@/lib/last-trip";
import { TripSelector } from "@/components/trip-selector";
import { VisibilityBadge } from "@/components/visibility-badge";
import {
  buildWelcomeUrl,
  deleteGroup,
  getGroup,
  getMemberForUser,
} from "@/lib/firestore/groups";
import type { GroupDoc } from "@/types/group";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { useState, useEffect, useRef } from "react";

/** `/groups/new` などは旅行IDとして扱わない */
const RESERVED_GROUP_PATH_SEGMENTS = new Set(["new"]);

function parseCurrentGroupId(pathname: string): string | null {
  const m = pathname.match(/^\/groups\/([^/]+)/);
  const seg = m?.[1];
  if (!seg || RESERVED_GROUP_PATH_SEGMENTS.has(seg)) return null;
  return seg;
}

export function AppHeader() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const currentGroupId = parseCurrentGroupId(pathname);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /** null: 未判定。オーナー・管理者向けブロックは true のときだけ表示 */
  const [showAdminMenuLink, setShowAdminMenuLink] = useState<boolean | null>(
    null,
  );
  /** 選択中の旅行の Firebase オーナー（旅行の削除はオーナーのみ） */
  const [menuTripIsOwner, setMenuTripIsOwner] = useState(false);
  const [deleteTripBusy, setDeleteTripBusy] = useState(false);
  /** メニュー内「招待」表示用（パスの旅行 = 選択中の旅行） */
  const [groupForMenu, setGroupForMenu] = useState<GroupDoc | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // パス変化でメニューを閉じる
  useEffect(() => {
    setMenuOpen(false);
    setInviteCopied(false);
  }, [pathname]);

  useEffect(() => {
    if (!user || !currentGroupId) {
      setShowAdminMenuLink(false);
      setMenuTripIsOwner(false);
      setGroupForMenu(null);
      return;
    }
    let cancelled = false;
    setShowAdminMenuLink(null);
    void (async () => {
      try {
        const [g, m] = await Promise.all([
          getGroup(currentGroupId),
          getMemberForUser(currentGroupId, user.uid),
        ]);
        if (cancelled) return;
        setGroupForMenu(g);
        if (!g) {
          setShowAdminMenuLink(false);
          setMenuTripIsOwner(false);
          return;
        }
        const ok =
          g.ownerId === user.uid ||
          m?.role === "admin" ||
          m?.role === "owner";
        setShowAdminMenuLink(ok);
        setMenuTripIsOwner(g.ownerId === user.uid);
      } catch {
        if (!cancelled) {
          setShowAdminMenuLink(false);
          setMenuTripIsOwner(false);
          setGroupForMenu(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, currentGroupId]);

  // 外クリックで閉じる
  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  async function copyCurrentInviteLink() {
    if (
      !groupForMenu ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    const url = buildWelcomeUrl(groupForMenu.inviteCode);
    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleDeleteTripFromMenu() {
    if (!user || !currentGroupId) return;
    if (
      !window.confirm(
        "旅行を削除します。メンバー全員がアクセスできなくなります。よろしいですか？",
      )
    ) {
      return;
    }
    setDeleteTripBusy(true);
    setMenuOpen(false);
    try {
      await deleteGroup(user.uid, currentGroupId);
      router.push("/groups");
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleteTripBusy(false);
    }
  }

  async function handleLogout() {
    if (!isFirebaseConfigured()) return;
    setSigningOut(true);
    setMenuOpen(false);
    try {
      if (user) clearLastTripId(user.uid);
      await signOut(getFirebaseAuth());
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {/* ロゴ */}
        <Link
          href={!loading && user ? "/dashboard" : "/"}
          className="shrink-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Trip Park
        </Link>

        {/* ログイン済みなら旅行セレクターを中央に（狭い画面では幅を抑えて右側のナビと共存） */}
        {!loading && user && (
          <div className="min-w-0 flex-1">
            <TripSelector />
          </div>
        )}

        {/* 右ナビ（旅行一覧はハンバーガーの横） */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {!loading && user ? (
            <>
              <Link
                href="/groups"
                aria-current={pathname === "/groups" ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:px-2.5 ${
                  pathname === "/groups"
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : ""
                }`}
              >
                旅行一覧
              </Link>
              {/* ── ハンバーガーメニュー ── */}
              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-label="メニューを開く"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {menuOpen ? (
                    /* × アイコン */
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  ) : (
                    /* ≡ アイコン */
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                {/* ドロップダウン */}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 min-w-[12rem] max-w-[min(100vw-2rem,20rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  {/* ユーザー情報（小さく） */}
                  <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {user.displayName ?? "ユーザー"}
                    </p>
                    <p className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                      {user.email}
                    </p>
                  </div>

                  {/* ナビリンク */}
                  <nav className="py-1">
                    {/* 1. プロフィール */}
                    <Link
                      href="/profile"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                        <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                      </svg>
                      プロフィール
                    </Link>
                    {/* 2. ダッシュボード */}
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                        <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
                      </svg>
                      ダッシュボード
                    </Link>
                    {/* 3. トピック（グループ選択中のみ） */}
                    {currentGroupId ? (
                      <Link
                        href={`/groups/${currentGroupId}/bulletin`}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                          <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5.414l-2.707 2.707A1 1 0 0 1 1 17V5Zm3 1a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H5Zm0 4a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H5Z" clipRule="evenodd" />
                        </svg>
                        トピック
                      </Link>
                    ) : null}
                    {/* 4. 旅行一覧 */}
                    <Link
                      href="/groups"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                        <path d="M10 1a6 6 0 0 0-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 0 0 .572.729 6.016 6.016 0 0 0 2.856 0A.75.75 0 0 0 12 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0 0 10 1ZM8.863 17.414a.75.75 0 0 0-.226 1.483 9.066 9.066 0 0 0 2.726 0 .75.75 0 0 0-.226-1.483 7.553 7.553 0 0 1-2.274 0Z" />
                      </svg>
                      旅行一覧
                    </Link>
                    {/* 5. 参加世帯（グループ選択中のみ） */}
                    {currentGroupId ? (
                      <Link
                        href={`/groups/${currentGroupId}/families`}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                          <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
                        </svg>
                        参加世帯
                      </Link>
                    ) : null}
                    {currentGroupId ? (
                      <Link
                        href={`/groups/${currentGroupId}/sharing`}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                          <path d="M3 3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H3Zm2 3h10v2H5V6Zm0 4h10v2H5v-2Zm0 4h7v2H5v-2Z" />
                        </svg>
                        買い出しリスト
                      </Link>
                    ) : null}
                    {/* 6. オーナー・管理者（メンバー管理・旅行の削除など） */}
                    {currentGroupId && showAdminMenuLink === true ? (
                      <div className="border-t border-zinc-100 py-2 dark:border-zinc-800">
                        <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                          オーナー・管理者
                        </p>
                        <Link
                          href={`/groups/${currentGroupId}/admin`}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                            <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834a6.953 6.953 0 0 1-1.416.587l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.957 6.957 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a6.957 6.957 0 0 1-.587-1.416l-1.473-.294A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.03l1.25.834a6.957 6.957 0 0 1 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
                          </svg>
                          <span className="min-w-0 flex-1 leading-snug">管理ページ</span>
                          <VisibilityBadge kind="admin" className="shrink-0" />
                        </Link>
                        {menuTripIsOwner ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteTripFromMenu()}
                            disabled={deleteTripBusy}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-red-500">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                            </svg>
                            <span className="min-w-0 flex-1 leading-snug">
                              {deleteTripBusy ? "削除中…" : "旅行を削除"}
                            </span>
                            <VisibilityBadge kind="owner" className="shrink-0" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {/* 7. 公式ポータル */}
                    <Link
                      href="/portal"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
                        <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 0 1 4.75 2h10.5A2.75 2.75 0 0 1 18 4.75v10.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25V4.75ZM4.75 3.5a1.25 1.25 0 0 0-1.25 1.25v2.5h13v-2.5a1.25 1.25 0 0 0-1.25-1.25H4.75Zm11.75 5.25h-13v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5Z" clipRule="evenodd" />
                      </svg>
                      公式ポータル
                    </Link>
                  </nav>

                  {currentGroupId && groupForMenu ? (
                    <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        選択中の旅行の招待
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {groupForMenu.name}
                      </p>
                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                        招待コード{" "}
                        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {groupForMenu.inviteCode}
                        </span>
                      </p>
                      <p className="mt-1 break-all text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                        {buildWelcomeUrl(groupForMenu.inviteCode)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void copyCurrentInviteLink()}
                          className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        >
                          {inviteCopied ? "コピーしました ✓" : "リンクをコピー"}
                        </button>
                        <a
                          href={`https://line.me/R/msg/text/?${encodeURIComponent(
                            `「${groupForMenu.name}」の旅行に招待されました！\n参加はこちらから👇\n${buildWelcomeUrl(groupForMenu.inviteCode)}`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-[#06C755] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#05b34c]"
                        >
                          LINEで送る
                        </a>
                        {typeof navigator !== "undefined" &&
                        "share" in navigator ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.share({
                                  title: `「${groupForMenu.name}」への招待`,
                                  text: `「${groupForMenu.name}」の旅行に招待されました！`,
                                  url: buildWelcomeUrl(groupForMenu.inviteCode),
                                });
                              } catch {
                                // キャンセルは無視
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            その他で共有
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* ログアウト */}
                  <div className="border-t border-zinc-100 py-1 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={signingOut}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                        <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.08a.75.75 0 1 0-1.004-1.114l-2.5 2.571a.75.75 0 0 0 0 1.087l2.5 2.571a.75.75 0 1 0 1.004-1.114l-1.048-1.079h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
                      </svg>
                      {signingOut ? "ログアウト中…" : "ログアウト"}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </>
          ) : (
            /* 未ログイン */
            <nav className="flex items-center gap-2 text-sm">
              <Link
                href="/portal"
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ポータル
              </Link>
              <Link
                href="/login"
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ログイン
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                新規登録
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
