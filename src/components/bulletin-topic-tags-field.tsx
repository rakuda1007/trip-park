"use client";

import {
  BULLETIN_TOPIC_TAG_ALL,
  BULLETIN_TOPIC_TAG_LABELS,
  type BulletinTopicTag,
} from "@/types/bulletin";

export function BulletinTopicTagsField({
  value,
  onChange,
  disabled,
}: {
  value: BulletinTopicTag[];
  onChange: (next: BulletinTopicTag[]) => void;
  disabled?: boolean;
}) {
  function toggle(t: BulletinTopicTag) {
    const s = new Set(value);
    if (s.has(t)) s.delete(t);
    else s.add(t);
    onChange(BULLETIN_TOPIC_TAG_ALL.filter((x) => s.has(x)));
  }

  return (
    <fieldset className="min-w-0">
      <legend className="text-xs text-zinc-600 dark:text-zinc-400">タグ</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {BULLETIN_TOPIC_TAG_ALL.map((t) => (
          <label
            key={t}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"
          >
            <input
              type="checkbox"
              checked={value.includes(t)}
              onChange={() => toggle(t)}
              disabled={disabled}
              className="rounded border-zinc-400 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-500 dark:bg-zinc-900"
            />
            {BULLETIN_TOPIC_TAG_LABELS[t]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
