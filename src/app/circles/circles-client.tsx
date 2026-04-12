"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  addCircleMember,
  createCircle,
  deleteCircle,
  deleteCircleMember,
  listCircleMembers,
  listCircles,
  updateCircle,
  updateCircleMember,
  type CircleItem,
  type CircleMemberItem,
} from "@/lib/firestore/circles";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function CirclesClient() {
  const { user } = useAuth();
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [editCircleId, setEditCircleId] = useState<string | null>(null);
  const [editCircleName, setEditCircleName] = useState("");
  const [openCircleId, setOpenCircleId] = useState<string | null>(null);

  const loadCircles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setCircles(await listCircles(user.uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCircles();
  }, [loadCircles]);

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newCircleName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCircle(user.uid, newCircleName);
      setNewCircleName("");
      await loadCircles();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCircle(circleId: string) {
    if (!editCircleName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateCircle(circleId, editCircleName);
      setEditCircleId(null);
      await loadCircles();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCircle(circleId: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？メンバーも全て削除されます。`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCircle(circleId);
      if (openCircleId === circleId) setOpenCircleId(null);
      await loadCircles();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div>
      {error ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {/* 新規サークル作成 */}
      <form onSubmit={handleCreateCircle} className="flex gap-2">
        <input
          type="text"
          required
          value={newCircleName}
          onChange={(e) => setNewCircleName(e.target.value)}
          placeholder="例: 三田小学校の集まり"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          作成
        </button>
      </form>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">読み込み中…</p>
      ) : circles.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          サークルがまだありません。上のフォームから作成してください。
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {circles.map((c) => (
            <CircleCard
              key={c.id}
              circle={c}
              isOpen={openCircleId === c.id}
              isEditing={editCircleId === c.id}
              editName={editCircleName}
              busy={busy}
              onToggleOpen={() =>
                setOpenCircleId((v) => (v === c.id ? null : c.id))
              }
              onStartEdit={() => {
                setEditCircleId(c.id);
                setEditCircleName(c.data.name);
              }}
              onEditNameChange={setEditCircleName}
              onSaveEdit={() => handleUpdateCircle(c.id)}
              onCancelEdit={() => setEditCircleId(null)}
              onDelete={() => handleDeleteCircle(c.id, c.data.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CircleCard({
  circle,
  isOpen,
  isEditing,
  editName,
  busy,
  onToggleOpen,
  onStartEdit,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  circle: CircleItem;
  isOpen: boolean;
  isEditing: boolean;
  editName: string;
  busy: boolean;
  onToggleOpen: () => void;
  onStartEdit: () => void;
  onEditNameChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const [members, setMembers] = useState<CircleMemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);

  // 新規メンバー追加フォーム
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");

  // 編集
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberNote, setEditMemberNote] = useState("");

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    setMemberError(null);
    try {
      setMembers(await listCircleMembers(circle.id));
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoadingMembers(false);
    }
  }, [circle.id]);

  useEffect(() => {
    if (isOpen) loadMembers();
  }, [isOpen, loadMembers]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setMemberBusy(true);
    setMemberError(null);
    try {
      await addCircleMember(circle.id, {
        displayName: newName.trim(),
        userId: null,
        note: newNote.trim() || null,
      });
      setNewName("");
      setNewNote("");
      await loadMembers();
    } catch (ex) {
      setMemberError(ex instanceof Error ? ex.message : "追加に失敗しました");
    } finally {
      setMemberBusy(false);
    }
  }

  async function handleUpdateMember(memberId: string) {
    if (!editMemberName.trim()) return;
    setMemberBusy(true);
    setMemberError(null);
    try {
      await updateCircleMember(circle.id, memberId, {
        displayName: editMemberName.trim(),
        userId: null,
        note: editMemberNote.trim() || null,
      });
      setEditMemberId(null);
      await loadMembers();
    } catch (ex) {
      setMemberError(ex instanceof Error ? ex.message : "更新に失敗しました");
    } finally {
      setMemberBusy(false);
    }
  }

  async function handleDeleteMember(memberId: string, name: string) {
    if (!confirm(`「${name}」をサークルから外しますか？`)) return;
    setMemberBusy(true);
    setMemberError(null);
    try {
      await deleteCircleMember(circle.id, memberId);
      await loadMembers();
    } catch (ex) {
      setMemberError(ex instanceof Error ? ex.message : "削除に失敗しました");
    } finally {
      setMemberBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3">
        {isEditing ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={busy}
              className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              保存
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-zinc-500 underline"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {circle.data.name}
            </span>
            <svg
              className={`h-4 w-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {!isEditing ? (
          <div className="ml-2 flex shrink-0 gap-2 text-xs">
            <button
              type="button"
              onClick={onStartEdit}
              className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
            >
              編集
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              削除
            </button>
          </div>
        ) : null}
      </div>

      {/* メンバー一覧（展開時） */}
      {isOpen ? (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          {memberError ? (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{memberError}</p>
          ) : null}
          {loadingMembers ? (
            <p className="text-sm text-zinc-500">読み込み中…</p>
          ) : (
            <>
              {members.length === 0 ? (
                <p className="text-sm text-zinc-400">メンバーがいません</p>
              ) : (
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-sm">
                      {editMemberId === m.id ? (
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editMemberName}
                            onChange={(e) => setEditMemberName(e.target.value)}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                          />
                          <input
                            type="text"
                            value={editMemberNote}
                            onChange={(e) => setEditMemberNote(e.target.value)}
                            placeholder="メモ（任意）"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateMember(m.id)}
                            disabled={memberBusy}
                            className="rounded bg-zinc-800 px-2 py-1 text-xs text-white disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditMemberId(null)}
                            className="text-xs text-zinc-500 underline"
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {m.data.displayName}
                            </span>
                            {m.data.note ? (
                              <span className="ml-2 text-xs text-zinc-400">
                                {m.data.note}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setEditMemberId(m.id);
                                setEditMemberName(m.data.displayName);
                                setEditMemberNote(m.data.note ?? "");
                              }}
                              className="text-zinc-500 hover:text-zinc-800"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMember(m.id, m.data.displayName)}
                              disabled={memberBusy}
                              className="text-red-500 hover:text-red-700 disabled:opacity-50"
                            >
                              削除
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* メンバー追加フォーム */}
              <form onSubmit={handleAddMember} className="mt-4 flex flex-wrap gap-2">
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="名前（例: Bさん）"
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="メモ・連絡先（任意）"
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                />
                <button
                  type="submit"
                  disabled={memberBusy}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
                >
                  追加
                </button>
              </form>

              {/* 旅行作成ページへのリンク（サークルを使って招待） */}
              {members.length > 0 ? (
                <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    このサークルのメンバーに旅行の招待を送るには、旅行作成時に「サークルから招待」を選んでください。
                  </p>
                  <Link
                    href="/groups/new"
                    className="mt-1 inline-block text-xs font-medium text-zinc-900 underline dark:text-zinc-100"
                  >
                    旅行を作成する →
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
