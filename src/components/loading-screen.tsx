export function LoadingScreen({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-zinc-600 dark:text-zinc-400"
      role="status"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
