"use client";

import {
  insertTextAtSelection,
  takeClipboardImageFile,
} from "@/lib/bulletin-paste-image";
import { uploadBulletinClipboardImage } from "@/lib/storage/bulletin-clipboard-image";
import { useCallback } from "react";

type UseBulletinImagePasteArgs = {
  groupId: string | undefined;
  uid: string | undefined;
  disabled: boolean;
  setBusy: (label: string | null) => void;
  setError: (msg: string | null) => void;
};

function getInsertSelection(
  value: string,
  el: HTMLTextAreaElement | HTMLInputElement | null,
): { start: number; end: number } {
  if (el != null && document.activeElement === el) {
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    return { start, end };
  }
  return { start: value.length, end: value.length };
}

/** 掲示板本文へクリップボード画像・ファイル画像を Storage に上げて `![](url)` で差し込む */
export function useBulletinImagePaste({
  groupId,
  uid,
  disabled,
  setBusy,
  setError,
}: UseBulletinImagePasteArgs) {
  const insertImageFromBlob = useCallback(
    async (
      file: Blob,
      value: string,
      setValue: (v: string) => void,
      anchorEl: HTMLTextAreaElement | HTMLInputElement | null,
      allowImagePaste: boolean,
    ) => {
      if (!groupId || !uid || disabled || !allowImagePaste) return;
      setBusy("paste-img");
      setError(null);
      try {
        const url = await uploadBulletinClipboardImage(groupId, uid, file);
        const insert = `\n![貼り付け画像](${url})\n`;
        const { start, end } = getInsertSelection(value, anchorEl);
        const next = insertTextAtSelection(value, insert, start, end);
        setValue(next);
        const pos = start + insert.length;
        const el = anchorEl;
        if (el && document.body.contains(el)) {
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(pos, pos);
          });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "画像のアップロードに失敗しました",
        );
      } finally {
        setBusy(null);
      }
    },
    [groupId, uid, disabled, setBusy, setError],
  );

  const pasteBulletinImage = useCallback(
    async (
      e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
      value: string,
      setValue: (v: string) => void,
      allowImagePaste: boolean,
    ) => {
      if (!groupId || !uid || disabled || !allowImagePaste) return;
      const file = takeClipboardImageFile(e.nativeEvent);
      if (!file) return;
      e.preventDefault();
      await insertImageFromBlob(
        file,
        value,
        setValue,
        e.currentTarget,
        allowImagePaste,
      );
    },
    [groupId, uid, disabled, insertImageFromBlob],
  );

  /** ファイルダイアログで選んだ画像を同一ルールで挿入（anchor がフォーカス中ならその位置へ） */
  const insertImageFromFile = useCallback(
    async (
      file: File | undefined,
      value: string,
      setValue: (v: string) => void,
      anchorRef: React.RefObject<
        HTMLTextAreaElement | HTMLInputElement | null
      >,
      allowImagePaste: boolean,
    ) => {
      if (!file) return;
      await insertImageFromBlob(
        file,
        value,
        setValue,
        anchorRef.current,
        allowImagePaste,
      );
    },
    [insertImageFromBlob],
  );

  return { pasteBulletinImage, insertImageFromFile };
}
