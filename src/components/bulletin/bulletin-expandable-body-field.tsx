"use client";

import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type ExpandPreset = "normal" | "expanded" | "tall";

function minHeightClass(preset: ExpandPreset): string {
  switch (preset) {
    case "normal":
      return "";
    case "expanded":
      return "min-h-[220px] sm:min-h-[280px]";
    case "tall":
      return "min-h-[380px] sm:min-h-[520px]";
    default:
      return "";
  }
}

const baseTextareaClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

const TEXTAREA_MIN_DRAG_PX = 72;

function maxTextareaDragHeightPx(): number {
  if (typeof window === "undefined") return 720;
  return Math.min(Math.round(window.innerHeight * 0.78), 900);
}

type BulletinExpandableBodyFieldProps = {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  rows: number;
  placeholder: string;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  /** ラベル行左側（例: 「本文」） */
  label: ReactNode;
  /** ラベル行右側・拡大ボタンの前（画像添付など） */
  leadingActions?: ReactNode;
};

export function BulletinExpandableBodyField({
  value,
  onChange,
  textareaRef,
  rows,
  placeholder,
  onPaste,
  disabled,
  label,
  leadingActions,
}: BulletinExpandableBodyFieldProps) {
  const [preset, setPreset] = useState<ExpandPreset>("normal");
  const [fullscreen, setFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /** ドラッグや明示操作で決めた高さ（null のときは rows / プリセットの min-h のみ） */
  const [userHeightPx, setUserHeightPx] = useState<number | null>(null);
  const fullscreenTitleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setUserHeightPx(null);
  }, [preset]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const el = textareaRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      });
    }
  }, [fullscreen, textareaRef]);

  function onResizeHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || fullscreen) return;
    e.preventDefault();
    const ta = textareaRef.current;
    if (!ta) return;
    const startY = e.clientY;
    const startH = ta.getBoundingClientRect().height;

    const onMove = (ev: PointerEvent) => {
      const next = Math.round(startH + (ev.clientY - startY));
      const maxH = maxTextareaDragHeightPx();
      setUserHeightPx(
        Math.min(maxH, Math.max(TEXTAREA_MIN_DRAG_PX, next)),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const presetBtn = (p: ExpandPreset, text: string) => (
    <button
      key={p}
      type="button"
      disabled={disabled || fullscreen}
      onClick={() => setPreset(p)}
      className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
        preset === p && !fullscreen
          ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-50"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      } disabled:opacity-40`}
    >
      {text}
    </button>
  );

  const textareaCommon = {
    value,
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
      onChange(e.target.value),
    rows: fullscreen ? Math.max(rows, 16) : rows,
    placeholder,
    onPaste,
    disabled,
  };

  const inlineClass = `${baseTextareaClass} resize-y max-h-[78vh] ${minHeightClass(fullscreen ? "normal" : preset)}`;

  const textareaRefCompat = textareaRef as Ref<HTMLTextAreaElement>;

  const modal = fullscreen && mounted && (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setFullscreen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={fullscreenTitleId}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-600 dark:bg-zinc-900 sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2
            id={fullscreenTitleId}
            className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
          >
            本文を広い画面で編集
          </h2>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <textarea
            ref={textareaRefCompat}
            {...textareaCommon}
            aria-labelledby={fullscreenTitleId}
            className={`${baseTextareaClass} max-h-[80vh] min-h-[55vh] resize-y sm:min-h-[50vh]`}
          />
        </div>
        <p className="shrink-0 border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          入力欄の右下をドラッグしても高さを変えられます。Esc
          または背景クリックで閉じます（入力内容は保持されます）
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {leadingActions}
          <span
            className="hidden text-[11px] text-zinc-400 sm:inline dark:text-zinc-500"
            aria-hidden
          >
            高さ
          </span>
          <div
            className="flex items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-800/80"
            role="group"
            aria-label="本文欄の高さ"
          >
            {presetBtn("normal", "標準")}
            {presetBtn("expanded", "広め")}
            {presetBtn("tall", "大きく")}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {fullscreen ? "全画面を閉じる" : "全画面"}
          </button>
        </div>
      </div>
      {!fullscreen ? (
        <div className="rounded-md">
          <textarea
            ref={textareaRefCompat}
            {...textareaCommon}
            style={
              userHeightPx != null
                ? { height: userHeightPx, maxHeight: maxTextareaDragHeightPx() }
                : undefined
            }
            className={`${inlineClass} rounded-b-none border-b-0`}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="上下にドラッグして本文欄の高さを調整"
            aria-disabled={disabled}
            onPointerDown={onResizeHandlePointerDown}
            className={`flex h-5 touch-none select-none items-center justify-center rounded-b-md border border-t-0 border-zinc-300 bg-zinc-100/90 dark:border-zinc-600 dark:bg-zinc-800/90 ${
              disabled
                ? "cursor-not-allowed opacity-40"
                : "cursor-ns-resize hover:bg-zinc-200/90 dark:hover:bg-zinc-700/90"
            }`}
          >
            <span
              className="pointer-events-none h-1 w-12 rounded-full bg-zinc-400 dark:bg-zinc-500"
              aria-hidden
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            下のバーを上下にドラッグするか、入力欄右下をドラッグして高さを変えられます。「標準」などを押すと高さの指定はリセットされます。
          </p>
        </div>
      ) : null}
      {modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
