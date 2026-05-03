"use client";

type BulletinImageAttachButtonProps = {
  inputId: string;
  disabled?: boolean;
  onFile: (file: File | undefined) => void;
};

/** 画像ファイルを選んで本文に埋め込む（親で Storage アップロード・差し込み） */
export function BulletinImageAttachButton({
  inputId,
  disabled,
  onFile,
}: BulletinImageAttachButtonProps) {
  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        className={`inline-flex shrink-0 cursor-pointer items-center rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
      >
        画像
      </label>
    </>
  );
}
