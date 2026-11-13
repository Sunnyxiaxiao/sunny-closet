import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { shop } from "@/config/shop";
import type { FulfillmentPaddings } from "@/lib/booking/rules";
import type { FulfillmentMethod } from "@/config/shop";
import { todayIn, type IsoDate } from "@/lib/dates";
import type { Locale } from "@/i18n/config";
import { GLOVES_CATEGORY, isCrystal } from "@/lib/gloves";
import { HELMET_COVER_CATEGORY } from "@/lib/helmet-covers";
import { sortSizes } from "@/lib/sizes";
import type { SettingsRow, StyleRow } from "@/lib/supabase/database.types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * The storefront's single entry point for products and availability (anonymous role, subject to RLS).
 * Availability stays live. Public descriptions and settings share a short cache; checkout re-reads prices independently.
 */

export type PublicStyle = Pick<
  StyleRow,
  | "id"
  | "slug"
  | "brand"
  | "category"
  | "name"
  | "description"
  | "daily_price_cents"
  | "deposit_cents"
  | "image_urls"
  | "source_url"
  | "tier"
  | "tags"
  | "addon_price_cents"
  | "replacement_value_cents"
  | "rental_prices_cents"
  | "variant_images"
  | "bundle_style_ids"
>;

/**
 * How long the public catalog is reused before it's read again. Admin edits refresh it at once (updateTag);
 * the wait only applies to changes made outside the admin (import script, SQL) or seen by another server instance.
 * Every read downloads the whole catalog from Supabase, which counts against the plan's egress quota.
 */
const CATALOG_CACHE = { stale: 0, revalidate: 300, expire: 900 } as const;

/** Everything lists and cards need. Descriptions are left out: they are half of the catalog's size and only product pages show them */
const STYLE_COLUMNS =
  "id, slug, brand, category, name, daily_price_cents, deposit_cents, image_urls, source_url, tier, tags, addon_price_cents, replacement_value_cents, rental_prices_cents, variant_images, bundle_style_ids, name_en";

type ListedStyleRow = Omit<PublicStyle, "description"> & Pick<StyleRow, "name_en">;
type StyleDescriptions = Pick<StyleRow, "description" | "description_en">;

/**
 * English pages use English names and descriptions (falling back to Chinese when missing).
 * Listed styles carry no description (pass none); a product page passes the one it read with styleDescriptions.
 */
function localize({ name_en, ...style }: ListedStyleRow, locale: Locale, text?: StyleDescriptions): PublicStyle {
  const description = text?.description ?? "";
  if (locale !== "en") return { ...style, description };
  return { ...style, name: name_en || style.name, description: text?.description_en || description };
}

/** Styles come in three kinds: outfits (set / one-piece / jacket / pants), helmet covers, gloves */
export type StyleKind = "outfit" | "helmet_cover" | "gloves";

const ACCESSORY_CATEGORIES = [HELMET_COVER_CATEGORY, GLOVES_CATEGORY] as const;

export function styleKind(category: StyleRow["category"]): StyleKind {
  return (ACCESSORY_CATEGORIES as readonly string[]).includes(category)
    ? (category as (typeof ACCESSORY_CATEGORIES)[number])
    : "outfit";
}

/** Maximum rental days for this category: gloves have their own limit, everything else uses maxRentalDays */
export function maxRentalDaysFor(
  category: StyleRow["category"],
  settings: Pick<ShopSettings, "maxRentalDays" | "glovesMaxRentalDays">,
) {
  return category === "gloves" ? settings.glovesMaxRentalDays : settings.maxRentalDays;
}

export interface ShopSettings {
  bufferDays: number;
  maxRentalDays: number;
  /** Maximum days for a standalone glove rental (gloves cap out from day 3, so without a limit they could be rented for a whole season) */
  glovesMaxRentalDays: number;
  /** Full-set price table: item n is the total rental for n days (cents); longer rentals use the last tier */
  rentalPricesCents: number[];
  /** Mix & Match: price tables for jacket-only / pants-only rentals */
  jacketPricesCents: number[];
  pantsPricesCents: number[];
  /** Regular price tables for Crystal Collection outfits (set / jacket / pants) */
  crystalPricesCents: number[];
  crystalJacketPricesCents: number[];
  crystalPantsPricesCents: number[];
  /** Last day (inclusive) of the Thanksgiving & Christmas promotion; empty means no promotion */
  crystalPromoEndsOn: IsoDate | null;
  /** Whether today (shop time zone) is within the promotion: if so, charge standard outfit prices and show the Crystal regular prices struck through */
  crystalPromoActive: boolean;
  /** Minimum rental days for shipping */
  shippingMinDays: number;
  /** Days of inventory occupied before and after the ski days for pickup / shipping (not billed) */
  paddings: FulfillmentPaddings;
}

export interface SizeAvailability {
  size: string;
  total: number;
  /** Equals total when no dates are given */
  available: number;
}

export const SETTINGS_COLUMNS =
  "buffer_days, max_rental_days, gloves_max_rental_days, rental_prices_cents, jacket_prices_cents, pants_prices_cents, crystal_prices_cents, crystal_jacket_prices_cents, crystal_pants_prices_cents, crystal_promo_ends_on, shipping_min_days, pickup_lead_days, pickup_tail_days, shipping_lead_days, shipping_tail_days" as const;

export function toShopSettings(
  row: Pick<
    SettingsRow,
    | "buffer_days"
    | "max_rental_days"
    | "gloves_max_rental_days"
    | "rental_prices_cents"
    | "jacket_prices_cents"
    | "pants_prices_cents"
    | "crystal_prices_cents"
    | "crystal_jacket_prices_cents"
    | "crystal_pants_prices_cents"
    | "crystal_promo_ends_on"
    | "shipping_min_days"
    | "pickup_lead_days"
    | "pickup_tail_days"
    | "shipping_lead_days"
    | "shipping_tail_days"
  >,
  today: IsoDate = todayIn(shop.timeZone),
): ShopSettings {
  return {
    bufferDays: row.buffer_days,
    maxRentalDays: row.max_rental_days,
    glovesMaxRentalDays: row.gloves_max_rental_days,
    rentalPricesCents: row.rental_prices_cents,
    jacketPricesCents: row.jacket_prices_cents,
    pantsPricesCents: row.pants_prices_cents,
    crystalPricesCents: row.crystal_prices_cents,
    crystalJacketPricesCents: row.crystal_jacket_prices_cents,
    crystalPantsPricesCents: row.crystal_pants_prices_cents,
    crystalPromoEndsOn: row.crystal_promo_ends_on as IsoDate | null,
    crystalPromoActive: row.crystal_promo_ends_on !== null && today <= row.crystal_promo_ends_on,
    shippingMinDays: row.shipping_min_days,
    paddings: {
      pickup: { leadDays: row.pickup_lead_days, tailDays: row.pickup_tail_days },
      shipping: { leadDays: row.shipping_lead_days, tailDays: row.shipping_tail_days },
    },
  };
}

export async function getToday(): Promise<IsoDate> {
  await connection();
  return todayIn(shop.timeZone);
}

/** Memoized per request (React cache), like getStyleBySlug */
export const getSettings = cache(async (): Promise<ShopSettings> => {
  await connection();
  return toShopSettings(await settingsRow());
});

async function settingsRow() {
  "use cache";
  cacheLife({ stale: 0, revalidate: 60, expire: 300 });
  cacheTag("storefront-settings");
  const { data, error } = await createSupabasePublicClient()
    .from("settings")
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw new Error(`读取店铺设置失败：${error.message}`);
  return data;
}

/**
 * Active styles. Lists outfits by default; pass kind: "helmet_cover" for helmet covers or kind: "gloves" for gloves. Names follow locale;
 * descriptions are empty here (only getStyleBySlug reads them).
 * "Top + black snow pants" sets aren't listed on their own (they're an option on the top's page); pass withPantsOptions: true to include them
 */
export async function listStyles({
  kind = "outfit",
  locale = "zh",
  withPantsOptions = false,
}: { kind?: StyleKind; locale?: Locale; withPantsOptions?: boolean } = {}): Promise<PublicStyle[]> {
  await connection();
  return (await activeStyleRows())
    .filter((row) => styleKind(row.category) === kind)
    .filter((row) => withPantsOptions || !row.tags.includes(WITH_PANTS_TAG))
    .map((row) => localize(row, locale));
}

/** A product page and its metadata both ask for the style: memoized per request (React cache), so it's read once */
export function getStyleBySlug(
  slug: string,
  { kind = "outfit", locale = "zh" }: { kind?: StyleKind; locale?: Locale } = {},
): Promise<PublicStyle | null> {
  return styleBySlug(slug, kind, locale);
}

const styleBySlug = cache(async (slug: string, kind: StyleKind, locale: Locale): Promise<PublicStyle | null> => {
  await connection();
  const data = (await activeStyleRows()).find((row) => row.slug === slug);
  if (!data || styleKind(data.category) !== kind) return null;
  return localize(data, locale, await styleDescriptions(data.id));
});

/** Shared by all three catalog categories and product metadata, never used for order authorization. */
async function activeStyleRows(): Promise<ListedStyleRow[]> {
  "use cache";
  cacheLife(CATALOG_CACHE);
  cacheTag("storefront-catalog");
  const { data, error } = await createSupabasePublicClient()
    .from("styles").select(STYLE_COLUMNS).eq("is_active", true)
    .order("sort_order").order("name");
  if (error) throw new Error(`读取款式失败：${error.message}`);
  return data;
}

/** One product's descriptions, read when its page is opened (cached like the catalog) */
async function styleDescriptions(id: string): Promise<StyleDescriptions> {
  "use cache";
  cacheLife(CATALOG_CACHE);
  cacheTag("storefront-catalog");
  const { data, error } = await createSupabasePublicClient()
    .from("styles").select("description, description_en").eq("id", id).maybeSingle();
  if (error) throw new Error(`读取款式介绍失败：${error.message}`);
  return data ?? { description: "", description_en: "" };
}

/**
 * Which price table this style uses: its own if it has one (helmet covers, gloves),
 * otherwise by category: jackets / pants use the Mix & Match tables, sets and one-pieces use the full-set table.
 * Exceptions: bib pants (bib tag) use jacket prices and hoodies (hoodie tag) use pants prices.
 * Crystal Collection outfits have their own regular price table and charge standard prices during the promotion (see crystalRegularTable).
 * The database's style_rental_price_cents applies the same rules and re-validates when the order is placed.
 */
export function stylePriceTable(style: PricedStyle, settings: PriceSettings): number[] {
  if (style.rental_prices_cents) return style.rental_prices_cents;
  const kind = priceKind(style);
  if (isCrystal(style) && !settings.crystalPromoActive) return crystalTables(settings)[kind];
  return { suit: settings.rentalPricesCents, jacket: settings.jacketPricesCents, pants: settings.pantsPricesCents }[kind];
}

/** Regular price table of Crystal outfits during the promotion (shown struck through); null outside the promotion or for non-Crystal outfits */
export function crystalRegularTable(style: PricedStyle, settings: PriceSettings): number[] | null {
  if (style.rental_prices_cents || !isCrystal(style) || !settings.crystalPromoActive) return null;
  return crystalTables(settings)[priceKind(style)];
}

type PricedStyle = Pick<PublicStyle, "rental_prices_cents" | "category" | "tags">;
type PriceSettings = Pick<
  ShopSettings,
  | "rentalPricesCents"
  | "jacketPricesCents"
  | "pantsPricesCents"
  | "crystalPricesCents"
  | "crystalJacketPricesCents"
  | "crystalPantsPricesCents"
  | "crystalPromoActive"
>;

/** Which category to price by: bib pants count as jackets, hoodies as pants, all other outfits as sets */
function priceKind(style: PricedStyle): "suit" | "jacket" | "pants" {
  if (style.category === "pants") return style.tags.includes(BIB_TAG) ? "jacket" : "pants";
  if (style.category === "jacket") return style.tags.includes(HOODIE_TAG) ? "pants" : "jacket";
  return "suit";
}

function crystalTables(settings: PriceSettings) {
  return {
    suit: settings.crystalPricesCents,
    jacket: settings.crystalJacketPricesCents,
    pants: settings.crystalPantsPricesCents,
  };
}

/**
 * Same style, different colors: styles sharing a series: tag (e.g. series:isee-cross) show each other as "Other colors" on the product page.
 * Full sets and jacket-only styles can be mixed (some colors only come as a jacket).
 */
export function sameSeries<T extends Pick<PublicStyle, "id" | "tags">>(style: T, all: T[]): T[] {
  const series = style.tags.filter((tag) => tag.startsWith("series:"));
  if (series.length === 0) return [];
  return all.filter((s) => s.id !== style.id && s.tags.some((tag) => series.includes(tag)));
}

/** Bib pants use jacket prices and hoodies use pants prices (see stylePriceTable) */
export const BIB_TAG = "bib";
export const HOODIE_TAG = "hoodie";
/**
 * The "top + random black snow pants" set offered by jacket-only styles (a bundle with a single separate).
 * Not listed on its own; it's an option when ordering from the top's page, charged at set prices and occupying that top's inventory
 */
export const WITH_PANTS_TAG = "with-black-pants";

/** Jacket and pants rentals (Mix & Match section) */
export function isSeparate(style: Pick<PublicStyle, "category">) {
  return style.category === "jacket" || style.category === "pants";
}

/** Total available count of each style for these dates (ignores scheduling without dates), for styles without sizes such as helmet covers */
export function availableCounts(availability: Map<string, SizeAvailability[]>): Map<string, number> {
  return new Map(
    [...availability].map(([styleId, sizes]) => [styleId, sizes.reduce((sum, s) => sum + s.available, 0)]),
  );
}

/**
 * Returns style id → available count per size. With dates (ski days), it follows the schedule:
 * including the lead / tail days of the fulfillment method and the cleaning buffer; defaults to local pickup (the shortest occupancy).
 */
export async function getAvailability(options: {
  start?: IsoDate;
  end?: IsoDate;
  styleId?: string;
  fulfillment?: FulfillmentMethod;
} = {}): Promise<Map<string, SizeAvailability[]>> {
  await connection();
  const { data, error } = await createSupabasePublicClient().rpc("get_availability", {
    p_start: options.start ?? null,
    p_end: options.end ?? null,
    p_style_id: options.styleId ?? null,
    p_fulfillment_method: options.fulfillment ?? "pickup",
  });
  if (error) throw new Error(`查询可用性失败：${error.message}`);

  const byStyle = new Map<string, SizeAvailability[]>();
  for (const row of data) {
    const list = byStyle.get(row.style_id) ?? [];
    list.push({ size: row.size, total: row.total_count, available: row.available_count });
    byStyle.set(row.style_id, list);
  }
  for (const [styleId, list] of byStyle) {
    const order = sortSizes(list.map((s) => s.size));
    byStyle.set(
      styleId,
      list.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size)),
    );
  }
  return byStyle;
}
