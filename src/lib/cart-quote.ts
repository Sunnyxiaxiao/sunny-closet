import "server-only";
import { shop } from "@/config/shop";
import type { Locale } from "@/i18n/config";
import { earliestShippingStart, validateRentalRange } from "@/lib/booking/rules";
import {
  maxRentalDaysFor,
  SETTINGS_COLUMNS,
  styleKind,
  stylePriceTable,
  toShopSettings,
  type ShopSettings,
  type StyleKind,
} from "@/lib/catalog";
import { cartConditionNotes, conditionDigest, type ConditionNote } from "@/lib/condition";
import { addDays, todayIn, type IsoDate } from "@/lib/dates";
import { isAddOnCategory, linesOverAddOnLimit, type AddOnCategory } from "@/lib/add-ons";
import { MAX_ADD_ONS_PER_OUTFIT } from "@/lib/helmet-covers";
import { thumbUrl } from "@/lib/images";
import { calculateQuote } from "@/lib/pricing";
import type { StyleCategory } from "@/lib/supabase/database.types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { CartLineInput } from "@/lib/validation/booking-request";

/**
 * Cart pricing and availability. Prices come only from the database (nothing from the browser is trusted);
 * the cart page (/api/cart) and order submission (submitOrder) use the same calculation.
 */

/** Why this item can't be ordered */
export type CartLineProblem =
  | "style_not_found"
  | "invalid_dates"
  | "start_in_past"
  | "too_long"
  | "invalid_addons"
  | "addon_not_found"
  | "addon_limit";

export interface PricedLine {
  input: CartLineInput;
  problem: CartLineProblem | null;
  style: {
    id: string;
    slug: string;
    kind: StyleKind;
    category: StyleCategory;
    name: string;
    brand: string | null;
    imageUrl: string | undefined;
  } | null;
  rentalDays: number;
  rentalCents: number;
  averageDailyCents: number;
  depositCents: number;
  addOns: PricedAddOn[];
}

/** An add-on as priced: a helmet cover, or gloves in a chosen color / size */
export interface PricedAddOn {
  id: string;
  name: string;
  cents: number;
  category: AddOnCategory;
  /** The gloves' color / size; null for a helmet cover */
  size: string | null;
}

const STOREFRONT_PATH: Record<StyleKind, string> = {
  outfit: "/styles",
  gloves: "/gloves",
  helmet_cover: "/helmet-covers",
};

export function storefrontPath(kind: StyleKind, slug: string) {
  return `${STOREFRONT_PATH[kind]}/${slug}`;
}

/** Prices each cart item's rental, deposit and add-ons from the database; does not check availability */
export async function priceCart(
  lines: CartLineInput[],
  locale: Locale,
): Promise<{ settings: ShopSettings; today: IsoDate; lines: PricedLine[] }> {
  const client = createSupabasePublicClient();
  const styleIds = [...new Set(lines.flatMap((l) => [l.styleId, ...l.addOnIds]))];
  const [settingsResult, stylesResult] = await Promise.all([
    client.from("settings").select(SETTINGS_COLUMNS).single(),
    client
      .from("styles")
      .select(
        "id, slug, category, name, name_en, brand, image_urls, variant_images, deposit_cents, rental_prices_cents, tags, addon_price_cents",
      )
      .in("id", styleIds.length ? styleIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("is_active", true),
  ]);
  if (settingsResult.error) throw new Error(`读取店铺设置失败：${settingsResult.error.message}`);
  if (stylesResult.error) throw new Error(`读取款式失败：${stylesResult.error.message}`);

  const today = todayIn(shop.timeZone);
  const settings = toShopSettings(settingsResult.data, today);
  const styles = new Map(stylesResult.data.map((s) => [s.id, s]));
  const nameOf = (s: { name: string; name_en: string }) => (locale === "en" && s.name_en ? s.name_en : s.name);

  const priced = lines.map((input): PricedLine => {
    const empty = { input, style: null, rentalDays: 0, rentalCents: 0, averageDailyCents: 0, depositCents: 0, addOns: [] };
    const s = styles.get(input.styleId);
    if (!s) return { ...empty, problem: "style_not_found" };

    const kind = styleKind(s.category);
    const imageIndex = s.variant_images[input.size] ?? 0;
    const style = {
      id: s.id,
      slug: s.slug,
      kind,
      category: s.category,
      name: nameOf(s),
      brand: s.brand,
      imageUrl: thumbUrl(s.image_urls[imageIndex] ?? s.image_urls[0]),
    };

    const rangeError = validateRentalRange(
      { start: input.start, end: input.end },
      { today, maxRentalDays: maxRentalDaysFor(s.category, settings) },
    );
    if (rangeError) {
      const problem = rangeError === "too_long" ? "too_long" : rangeError === "start_in_past" ? "start_in_past" : "invalid_dates";
      return { ...empty, style, problem };
    }

    // Only outfits can have add-ons: one helmet cover and one pair of gloves at most, gloves in a chosen size
    const addOnStyles = input.addOnIds.map((id) => styles.get(id));
    const missingAddOn = addOnStyles.some((a) => !a || !isAddOnCategory(a.category) || a.addon_price_cents === null);
    const addOns: PricedAddOn[] = missingAddOn
      ? []
      : addOnStyles.map((a, i) => ({
          id: a!.id,
          name: nameOf(a!),
          cents: a!.addon_price_cents ?? 0,
          category: a!.category as AddOnCategory,
          size: a!.category === "gloves" ? (input.addOnSizes[i] ?? null) : null,
        }));
    const addOnProblem =
      input.addOnIds.length > 0 &&
      (kind !== "outfit" ||
        input.addOnIds.length > MAX_ADD_ONS_PER_OUTFIT ||
        new Set(addOns.map((a) => a.category)).size < addOns.length ||
        addOns.some((a) => a.category === "gloves" && !a.size))
        ? "invalid_addons"
        : null;

    const quote = calculateQuote({
      start: input.start,
      end: input.end,
      rentalPricesCents: stylePriceTable(s, settings),
      depositCents: s.deposit_cents,
    });
    return {
      input,
      style,
      problem: addOnProblem ?? (missingAddOn ? "addon_not_found" : null),
      rentalDays: quote.rentalDays,
      rentalCents: quote.rentalCents,
      averageDailyCents: quote.averageDailyCents,
      depositCents: quote.depositCents,
      addOns,
    };
  });

  // More add-ons than outfits (one helmet cover and one pair of gloves each): the items past the limit can't be ordered as they are
  const over = linesOverAddOnLimit(
    priced.map((l) => ({ category: l.style?.category ?? "", addOnCategories: l.addOns.map((a) => a.category) })),
  );
  for (const index of over) priced[index].problem ??= "addon_limit";

  return { settings, today, lines: priced };
}

export interface CartQuoteLine {
  id: string;
  problem: CartLineProblem | null;
  style: (Omit<NonNullable<PricedLine["style"]>, "slug"> & { path: string }) | null;
  size: string;
  start: IsoDate;
  end: IsoDate;
  rentalDays: number;
  rentalCents: number;
  depositCents: number;
  addOns: (PricedAddOn & { pickupOk: boolean; shippingOk: boolean })[];
  /** Whether this item (with add-ons) is available for pickup / shipping on these dates, after the items before it in the cart */
  pickupOk: boolean;
  shippingOk: boolean;
  /** Disclosed flaws on the pieces this item could come with; the customer confirms them before ordering */
  conditionNotes: ConditionNote[];
  /** Fingerprint of those notes, sent back with the confirmation so checkout can tell if they changed since (null = no notes) */
  conditionDigest: string | null;
}

export interface CartQuote {
  lines: CartQuoteLine[];
  shippingMinDays: number;
  shippingLeadDays: number;
  /** Earliest first ski day available for shipping */
  earliestShippingStart: IsoDate;
  /** Shipping orders starting before this give short notice: rush shipping, or wait for the owner to accept */
  shortNoticeBefore: IsoDate;
}

function withPath({ slug, ...style }: NonNullable<PricedLine["style"]>) {
  return { ...style, path: storefrontPath(style.kind, slug) };
}

/** For the cart page: prices + per-item pickup / shipping availability */
export async function quoteCart(lines: CartLineInput[], locale: Locale): Promise<CartQuote> {
  const [{ settings, today, lines: priced }, conditionNotes] = await Promise.all([
    priceCart(lines, locale),
    cartConditionNotes(lines, locale),
  ]);

  // The whole cart allocated in the database the way an order is (overlapping dates, sets sharing pieces with single items,
  // add-ons sharing helmet covers with standalone ones): items with a problem are left out
  const checked = priced.filter((l) => !l.problem);
  const availability = new Map<string, { pickup: boolean; shipping: boolean; addOnsPickup: boolean; addOnsShipping: boolean }>();
  if (checked.length > 0) {
    const { data, error } = await createSupabasePublicClient().rpc("cart_availability", {
      p_lines: checked.map(({ input }) => ({
        style_id: input.styleId,
        size: input.size,
        start: input.start,
        end: input.end,
        addon_style_ids: input.addOnIds,
        addon_sizes: input.addOnSizes,
      })),
    });
    if (error) throw new Error(`查询可用性失败：${error.message}`);
    checked.forEach(({ input }, i) => {
      const row = (method: "pickup" | "shipping") => data.find((r) => r.line === i + 1 && r.fulfillment_method === method);
      availability.set(input.id, {
        pickup: row("pickup")?.item_ok ?? false,
        shipping: row("shipping")?.item_ok ?? false,
        addOnsPickup: row("pickup")?.addons_ok ?? false,
        addOnsShipping: row("shipping")?.addons_ok ?? false,
      });
    });
  }

  const quoted = priced.map((line): CartQuoteLine => {
    const { input } = line;
    const base = {
      id: input.id,
      problem: line.problem,
      style: line.style ? withPath(line.style) : null,
      size: input.size,
      start: input.start,
      end: input.end,
      rentalDays: line.rentalDays,
      rentalCents: line.rentalCents,
      depositCents: line.depositCents,
      conditionNotes: conditionNotes.get(input.id) ?? [],
      conditionDigest: conditionDigest(conditionNotes.get(input.id) ?? []),
    };
    const avail = availability.get(input.id);
    if (line.problem || !avail) {
      return { ...base, addOns: line.addOns.map((a) => ({ ...a, pickupOk: false, shippingOk: false })), pickupOk: false, shippingOk: false };
    }
    const addOns = line.addOns.map((a) => ({ ...a, pickupOk: avail.addOnsPickup, shippingOk: avail.addOnsShipping }));
    return {
      ...base,
      addOns,
      pickupOk: avail.pickup && addOns.every((a) => a.pickupOk),
      shippingOk: avail.shipping && addOns.every((a) => a.shippingOk),
    };
  });

  return {
    lines: quoted,
    shippingMinDays: settings.shippingMinDays,
    shippingLeadDays: settings.paddings.shipping.leadDays,
    earliestShippingStart: earliestShippingStart(today, settings.paddings),
    shortNoticeBefore: addDays(today, shop.shipping.orderAheadDays),
  };
}
