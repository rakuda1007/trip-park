/**
 * 管理者・オーナー向けにだけ出る UI の見出し横に付け、
 * 「自分だけに見えているのか」を明示する。
 */

const COPY = {
  admin: {
    label: "管理者のみ表示",
    title:
      "オーナーおよび管理者ロールのメンバーにのみ表示されます。一般メンバーには表示されません。",
  },
  owner: {
    label: "オーナー",
    title: "旅行のオーナーにのみ表示されます。",
  },
  authorOrAdmin: {
    label: "投稿者・管理者",
    title:
      "この話題の投稿者、またはオーナー・管理者にのみ表示されます。",
  },
} as const;

export type VisibilityBadgeKind = keyof typeof COPY;

export function VisibilityBadge({
  kind,
  className = "",
  title: titleOverride,
}: {
  kind: VisibilityBadgeKind;
  className?: string;
  /** ツールチップを上書きするとき */
  title?: string;
}) {
  const c = COPY[kind];
  return (
    <span
      role="note"
      title={titleOverride ?? c.title}
      className={`inline-flex shrink-0 items-center rounded border border-amber-600/45 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/45 dark:text-amber-100 ${className}`}
    >
      {c.label}
    </span>
  );
}
