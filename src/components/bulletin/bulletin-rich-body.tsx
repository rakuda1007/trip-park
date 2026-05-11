"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type BulletinRichBodyProps = {
  body: string;
  /** 外側ラッパー（省略時はフラグメント相当のブロック） */
  className?: string;
  /** テキスト部分のクラス（バブル内は白文字など） */
  textClassName?: string;
  /** 画像の追加クラス（バブル内のコントラスト用） */
  imgClassName?: string;
};

/**
 * 本文の `![alt](https://...)` を画像として表示し、それ以外はそのまま表示する。
 * Firestore 容量のため画像は Storage URL のマークダウン参照のみ対応。
 */
export function BulletinRichBody({
  body,
  className,
  textClassName = "text-zinc-800 dark:text-zinc-200",
  imgClassName = "border-zinc-200 dark:border-zinc-600",
}: BulletinRichBodyProps) {
  const [zoomedImage, setZoomedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [modalScale, setModalScale] = useState(1);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartOffsetRef = useRef({ x: 0, y: 0 });
  const lastTapTimeRef = useRef(0);

  useEffect(() => {
    if (!zoomedImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomedImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomedImage]);

  useEffect(() => {
    if (!zoomedImage) {
      setModalScale(1);
      setModalOffset({ x: 0, y: 0 });
      pinchStartDistanceRef.current = null;
      pinchStartScaleRef.current = 1;
      dragStartPointRef.current = null;
      dragStartOffsetRef.current = { x: 0, y: 0 };
    }
  }, [zoomedImage]);

  function touchDistance(
    t1: { clientX: number; clientY: number },
    t2: { clientX: number; clientY: number },
  ): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  function clampScale(v: number): number {
    return Math.min(4, Math.max(1, v));
  }

  function zoomIn() {
    setModalScale((prev) => clampScale(prev + 0.25));
  }

  function zoomOut() {
    setModalScale((prev) => {
      const next = clampScale(prev - 0.25);
      if (next <= 1) setModalOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function resetZoom() {
    setModalScale(1);
    setModalOffset({ x: 0, y: 0 });
  }

  const parts: ReactNode[] = [];
  const re = /!\[([^\]]*)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push(
        <span
          key={`t-${key++}`}
          className={`whitespace-pre-wrap break-words ${textClassName}`}
        >
          {body.slice(last, m.index)}
        </span>,
      );
    }
    const alt = m[1] ?? "";
    const url = m[2];
    parts.push(
      <span key={`img-${key++}`} className="my-1 block max-w-full">
        <button
          type="button"
          onClick={() =>
            setZoomedImage({ src: url, alt: alt || "貼り付け画像" })
          }
          className="block max-w-full cursor-zoom-in"
          aria-label="画像を拡大表示"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Storage の公開トークン付き URL */}
          <img
            src={url}
            alt={alt || "貼り付け画像"}
            className={`max-h-64 max-w-full rounded-md border object-contain ${imgClassName}`}
            loading="lazy"
          />
        </button>
      </span>,
    );
    last = m.index + m[0].length;
  }

  if (last < body.length) {
    parts.push(
      <span
        key={`t-${key++}`}
        className={`whitespace-pre-wrap break-words ${textClassName}`}
      >
        {body.slice(last)}
      </span>,
    );
  }

  if (parts.length === 0) {
    return body ? (
      <span className={`whitespace-pre-wrap break-words ${textClassName}`}>
        {body}
      </span>
    ) : null;
  }

  return (
    <>
      <div className={className ?? "text-sm leading-relaxed"}>{parts}</div>
      {zoomedImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="拡大画像"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="absolute right-3 top-3 flex flex-wrap items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 rounded-md bg-black/55 p-1">
              <button
                type="button"
                aria-label="拡大"
                onClick={(e) => {
                  e.stopPropagation();
                  zoomIn();
                }}
                className="rounded bg-white/15 px-2 py-1 text-sm text-white hover:bg-white/25"
              >
                ＋
              </button>
              <button
                type="button"
                aria-label="縮小"
                onClick={(e) => {
                  e.stopPropagation();
                  zoomOut();
                }}
                className="rounded bg-white/15 px-2 py-1 text-sm text-white hover:bg-white/25"
              >
                －
              </button>
              <button
                type="button"
                aria-label="拡大率をリセット"
                onClick={(e) => {
                  e.stopPropagation();
                  resetZoom();
                }}
                className="rounded bg-white/15 px-2 py-1 text-xs text-white hover:bg-white/25"
              >
                リセット
              </button>
            </div>
            <button
              type="button"
              aria-label="拡大画像を閉じる"
              onClick={(e) => {
                e.stopPropagation();
                setZoomedImage(null);
              }}
              className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/30"
            >
              閉じる
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Storage の公開トークン付き URL */}
          <img
            src={zoomedImage.src}
            alt={zoomedImage.alt}
            className="max-h-[90vh] max-w-[95vw] rounded-md object-contain"
            style={{
              transform: `translate(${modalOffset.x}px, ${modalOffset.y}px) scale(${modalScale})`,
              transformOrigin: "center center",
              touchAction: "none",
              WebkitTapHighlightColor: "transparent",
              WebkitTouchCallout: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              transition: pinchStartDistanceRef.current ? "none" : "transform 100ms ease-out",
            }}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (modalScale > 1.05) {
                resetZoom();
              } else {
                setModalScale(2);
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length === 2) {
                pinchStartDistanceRef.current = touchDistance(
                  e.touches[0]!,
                  e.touches[1]!,
                );
                pinchStartScaleRef.current = modalScale;
                dragStartPointRef.current = null;
                return;
              }
              if (e.touches.length === 1 && modalScale > 1.001) {
                dragStartPointRef.current = {
                  x: e.touches[0]!.clientX,
                  y: e.touches[0]!.clientY,
                };
                dragStartOffsetRef.current = modalOffset;
              }
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              if (e.touches.length === 2) {
                e.preventDefault();
                const start = pinchStartDistanceRef.current;
                if (!start || start <= 0) return;
                const current = touchDistance(e.touches[0]!, e.touches[1]!);
                const rawScale = pinchStartScaleRef.current * (current / start);
                const nextScale = clampScale(rawScale);
                setModalScale(nextScale);
                return;
              }
              if (
                e.touches.length === 1 &&
                modalScale > 1.001 &&
                dragStartPointRef.current
              ) {
                e.preventDefault();
                const dx = e.touches[0]!.clientX - dragStartPointRef.current.x;
                const dy = e.touches[0]!.clientY - dragStartPointRef.current.y;
                setModalOffset({
                  x: dragStartOffsetRef.current.x + dx,
                  y: dragStartOffsetRef.current.y + dy,
                });
              }
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              if (e.touches.length === 0) {
                const now = Date.now();
                if (now - lastTapTimeRef.current < 280) {
                  if (modalScale > 1.05) {
                    resetZoom();
                  } else {
                    setModalScale(2);
                  }
                }
                lastTapTimeRef.current = now;
              }
              if (e.touches.length < 2) {
                pinchStartDistanceRef.current = null;
                pinchStartScaleRef.current = modalScale;
              }
              if (e.touches.length === 0) {
                dragStartPointRef.current = null;
                dragStartOffsetRef.current = modalOffset;
              }
              if (modalScale <= 1.001) {
                setModalOffset({ x: 0, y: 0 });
              }
            }}
          />
        </div>
      ) : null}
    </>
  );
}
