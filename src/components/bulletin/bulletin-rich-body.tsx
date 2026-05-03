import type { ReactNode } from "react";

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
        {/* eslint-disable-next-line @next/next/no-img-element -- Storage の公開トークン付き URL */}
        <img
          src={url}
          alt={alt || "貼り付け画像"}
          className={`max-h-64 max-w-full rounded-md border object-contain ${imgClassName}`}
          loading="lazy"
        />
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

  return <div className={className ?? "text-sm leading-relaxed"}>{parts}</div>;
}
