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
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);

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
      pinchStartDistanceRef.current = null;
      pinchStartScaleRef.current = 1;
    }
  }, [zoomedImage]);

  function touchDistance(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
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
          <button
            type="button"
            aria-label="拡大画像を閉じる"
            onClick={() => setZoomedImage(null)}
            className="absolute right-3 top-3 rounded-md bg-black/50 px-2 py-1 text-sm text-white hover:bg-black/70"
          >
            閉じる
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- Storage の公開トークン付き URL */}
          <img
            src={zoomedImage.src}
            alt={zoomedImage.alt}
            className="max-h-[90vh] max-w-[95vw] rounded-md object-contain"
            style={{
              transform: `scale(${modalScale})`,
              transformOrigin: "center center",
              touchAction: "none",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length !== 2) return;
              pinchStartDistanceRef.current = touchDistance(
                e.touches[0]!,
                e.touches[1]!,
              );
              pinchStartScaleRef.current = modalScale;
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              if (e.touches.length !== 2) return;
              const start = pinchStartDistanceRef.current;
              if (!start || start <= 0) return;
              const current = touchDistance(e.touches[0]!, e.touches[1]!);
              const rawScale = pinchStartScaleRef.current * (current / start);
              const nextScale = Math.min(4, Math.max(1, rawScale));
              setModalScale(nextScale);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              if (e.touches.length < 2) {
                pinchStartDistanceRef.current = null;
                pinchStartScaleRef.current = modalScale;
              }
            }}
          />
        </div>
      ) : null}
    </>
  );
}
