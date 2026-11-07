import "server-only";
import { createHash } from "node:crypto";
import type { Locale } from "@/i18n/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { CartLineInput } from "@/lib/validation/booking-request";

/**
 * Condition notes: flaws on a specific piece of stock that the admin chose to disclose (note + close-up photos).
 * Shown on the product page and confirmed by the customer at checkout; the database copies the note of the piece an order gets
 * onto the order in the same transaction (insert_booking_row) and refuses the order if that item wasn't confirmed (create_order).
 * inventory_items is admin-only (it also holds purchase prices), so these are read with the service role, condition columns only.
 */

/** One piece's disclosed flaws, as shown to customers */
export interface ConditionNote {
  itemId: string;
  /** The piece's style when it isn't the style itself (a set's jacket or pants, a helmet-cover add-on) */
  label: string | null;
  size: string;
  text: string;
  imageUrls: string[];
}

interface NotedItem {
  id: string;
  style_id: string;
  code: string;
  size: string;
  condition_note: string;
  condition_note_en: string;
  condition_image_urls: string[];
}

const NOTED_COLUMNS = "id, style_id, code, size, condition_note, condition_note_en, condition_image_urls";

/** Rentable pieces of these styles that have a condition note */
async function notedItems(styleIds: string[]): Promise<NotedItem[]> {
  if (styleIds.length === 0) return [];
  const { data, error } = await createSupabaseServiceClient()
    .from("inventory_items")
    .select(NOTED_COLUMNS)
    .in("style_id", [...new Set(styleIds)])
    .eq("status", "available")
    .neq("condition_note", "")
    .order("code");
  if (error) throw new Error(`读取状态说明失败：${error.message}`);
  return data;
}

async function styleNames(ids: string[], locale: Locale) {
  if (ids.length === 0) return new Map<string, { name: string; parts: string[] | null }>();
  const { data, error } = await createSupabaseServiceClient()
    .from("styles")
    .select("id, name, name_en, bundle_style_ids")
    .in("id", [...new Set(ids)]);
  if (error) throw new Error(`读取款式失败：${error.message}`);
  return new Map(
    data.map((s) => [s.id, { name: (locale === "en" && s.name_en) || s.name, parts: s.bundle_style_ids }]),
  );
}

function toNote(item: NotedItem, locale: Locale, label: string | null): ConditionNote {
  return {
    itemId: item.id,
    label,
    size: item.size,
    text: (locale === "en" && item.condition_note_en) || item.condition_note,
    imageUrls: item.condition_image_urls,
  };
}

/**
 * Notes for a product page, every size. A set has no stock of its own (its jacket and pants are separate styles),
 * so its notes are those of its pieces, labelled with the piece's name.
 */
export async function styleConditionNotes(
  style: { id: string; bundle_style_ids: string[] | null },
  locale: Locale,
): Promise<ConditionNote[]> {
  const parts = style.bundle_style_ids;
  const [items, names] = await Promise.all([
    notedItems(parts ?? [style.id]),
    parts ? styleNames(parts, locale) : Promise.resolve(null),
  ]);
  return items.map((item) => toNote(item, locale, names?.get(item.style_id)?.name ?? null));
}

/**
 * Notes each cart item could come with: pieces of its style (or of its set's pieces) in its size, plus any piece
 * of its helmet-cover add-on (any piece of it could go out, so every noted one counts) and its gloves add-on in the chosen size.
 * Keyed by cart line id; lines without notes are left out.
 */
export async function cartConditionNotes(lines: CartLineInput[], locale: Locale): Promise<Map<string, ConditionNote[]>> {
  const result = new Map<string, ConditionNote[]>();
  if (lines.length === 0) return result;
  const lineStyles = await styleNames(lines.map((l) => l.styleId), locale);
  const pieceStyles = lines.flatMap((l) => lineStyles.get(l.styleId)?.parts ?? [l.styleId]);
  const addOnStyles = lines.flatMap((l) => l.addOnIds);
  const [items, names] = await Promise.all([
    notedItems([...pieceStyles, ...addOnStyles]),
    styleNames([...pieceStyles, ...addOnStyles], locale),
  ]);

  for (const line of lines) {
    const parts = lineStyles.get(line.styleId)?.parts ?? null;
    const own = items
      .filter((i) => (parts ?? [line.styleId]).includes(i.style_id) && i.size === line.size)
      .map((i) => toNote(i, locale, parts ? (names.get(i.style_id)?.name ?? null) : null));
    // Gloves add-ons come in the chosen size; a helmet cover can be any piece of its style
    const addOns = items
      .filter((i) => line.addOnIds.some((id, n) => id === i.style_id && (line.addOnSizes[n] ?? i.size) === i.size))
      .map((i) => toNote(i, locale, names.get(i.style_id)?.name ?? null));
    if (own.length + addOns.length > 0) result.set(line.id, [...own, ...addOns]);
  }
  return result;
}

/**
 * Fingerprint of an item's notes as the customer saw them (which pieces, the text, the photos).
 * The checkbox sends it back, so checkout can refuse a confirmation of notes that have changed since.
 */
export function conditionDigest(notes: ConditionNote[]): string | null {
  if (notes.length === 0) return null;
  const content = JSON.stringify(notes.map((n) => [n.itemId, n.text, n.imageUrls]));
  return createHash("sha256").update(content).digest("base64url").slice(0, 22);
}
