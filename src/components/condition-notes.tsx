import Image from "next/image";
import type { Locale } from "@/i18n/config";
import type { ConditionNote } from "@/lib/condition";
import { thumbUrl } from "@/lib/images";
import { getMessages, sizeLabel } from "@/messages";

/**
 * Product page "Condition notes": disclosed flaws per piece with close-up photos, collapsed until opened and kept apart
 * from the model photos. Only rendered when some piece has a note.
 */
export function ConditionNotes({
  notes,
  locale,
  className = "",
}: {
  notes: ConditionNote[];
  locale: Locale;
  className?: string;
}) {
  if (notes.length === 0) return null;
  const t = getMessages(locale).product;
  return (
    <details id="condition" className={`group scroll-mt-24 border-b border-neutral-200 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {t.conditionTitle}
        <span className="text-lg leading-none transition group-open:rotate-45">+</span>
      </summary>
      <div className="space-y-5 pb-5 text-sm leading-relaxed text-neutral-700">
        <p className="text-xs text-neutral-500">{t.conditionIntro}</p>
        {notes.map((note) => (
          <ConditionNoteBody key={note.itemId} note={note} locale={locale} />
        ))}
      </div>
    </details>
  );
}

/** One piece: which one (size, and the piece's name inside a set or add-on), the note, the photos (tap for full size) */
export function ConditionNoteBody({ note, locale }: { note: ConditionNote; locale: Locale }) {
  const t = getMessages(locale).product;
  return (
    <div>
      <p className="font-semibold text-neutral-900">
        {[note.label, t.conditionSize(sizeLabel(note.size, locale))].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-1 whitespace-pre-line">{note.text}</p>
      {note.imageUrls.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {note.imageUrls.map((url, i) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                <Image
                  src={thumbUrl(url)}
                  alt={`${t.conditionPhoto} ${i + 1}`}
                  width={88}
                  height={88}
                  unoptimized
                  className="h-22 w-22 bg-neutral-100 object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
