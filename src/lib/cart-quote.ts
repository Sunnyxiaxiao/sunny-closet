import "server-only";
import { shop } from "@/config/shop";
import type { Locale } from "@/i18n/config";
import { earliestShippingStart, validateRentalRange } from "@/lib/booking/rules";
import {
  getAvailability,
  maxRentalDaysFor,
  SETTINGS_COLUMNS,
  styleKind,
  stylePriceTable,
  toShopSettings,
  type ShopSettings,
  type StyleKind,
} from "@/lib/catalog";
import { todayIn, type IsoDate } from "@/lib/dates";
import { HELMET_COVER_CATEGORY, MAX_ADD_ONS_PER_OUTFIT } from "@/lib/helmet-covers";
import { thumbUrl } from "@/lib/images";
import { calculateQuote } from "@/lib/pricing";
import type { StyleCategory } from "@/lib/supabase/database.types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { CartLineInput } from "@/lib/validation/booking-request";

/**
 * 购物车的价格和可租情况。价格只用数据库里的（不信任浏览器传来的），
 * 购物车页面（/api/cart）和提交订单（submitOrder）用同一套计算。
 */

/** 这一件为什么不能下单 */
export type CartLineProblem =
  | "style_not_found"
  | "invalid_dates"
  | "start_in_past"
  | "too_long"
  | "invalid_addons"
  | "addon_not_found";

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
  addOns: { id: string; name: string; cents: number }[];
}

const STOREFRONT_PATH: Record<StyleKind, string> = {
  outfit: "/styles",
  gloves: "/gloves",
  helmet_cover: "/helmet-covers",
};

export function storefrontPath(kind: StyleKind, slug: string) {
  return `${STOREFRONT_PATH[kind]}/${slug}`;
}

/** 按数据库里的价格给购物车每一件算租金、押金、加购价；不查是否有货 */
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

    // 只有雪服能加购头盔套
    const addOnProblem =
      input.addOnIds.length > 0 && (kind !== "outfit" || input.addOnIds.length > MAX_ADD_ONS_PER_OUTFIT)
        ? "invalid_addons"
        : null;
    const addOns = input.addOnIds.map((id) => styles.get(id));
    const missingAddOn = addOns.some((a) => !a || a.category !== HELMET_COVER_CATEGORY || a.addon_price_cents === null);

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
      addOns: missingAddOn
        ? []
        : addOns.map((a) => ({ id: a!.id, name: nameOf(a!), cents: a!.addon_price_cents ?? 0 })),
    };
  });

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
  addOns: { id: string; name: string; cents: number; pickupOk: boolean; shippingOk: boolean }[];
  /** 这件（含加购）在这段时间到店自取 / 邮寄是否还有货（同一购物车里重复的同款同尺码会累加计算） */
  pickupOk: boolean;
  shippingOk: boolean;
}

export interface CartQuote {
  lines: CartQuoteLine[];
  shippingMinDays: number;
  shippingLeadDays: number;
  /** 邮寄最早能选的第一个滑雪日 */
  earliestShippingStart: IsoDate;
}

function withPath({ slug, ...style }: NonNullable<PricedLine["style"]>) {
  return { ...style, path: storefrontPath(style.kind, slug) };
}

/** 购物车页面用：价格 + 每件到店自取 / 邮寄是否有货 */
export async function quoteCart(lines: CartLineInput[], locale: Locale): Promise<CartQuote> {
  const { settings, today, lines: priced } = await priceCart(lines, locale);

  // 同一段日期只查一次：款式 id → 各尺码可租件数
  const ranges = [...new Set(priced.filter((l) => !l.problem).map((l) => `${l.input.start}|${l.input.end}`))];
  const availability = new Map(
    await Promise.all(
      ranges.map(async (key) => {
        const [start, end] = key.split("|") as [IsoDate, IsoDate];
        const [pickup, shipping] = await Promise.all([
          getAvailability({ start, end }),
          getAvailability({ start, end, fulfillment: "shipping" }),
        ]);
        return [key, { pickup, shipping }] as const;
      }),
    ),
  );

  // 购物车里同款、同尺码、同日期的件数（第 n 件要有 n 件空着才够）
  const demand = new Map<string, number>();
  const need = (key: string) => {
    const n = (demand.get(key) ?? 0) + 1;
    demand.set(key, n);
    return n;
  };
  const countOf = (map: Map<string, { size: string; available: number }[]>, styleId: string, size: string | null) =>
    (map.get(styleId) ?? [])
      .filter((s) => size === null || s.size === size)
      .reduce((sum, s) => sum + s.available, 0);

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
    };
    const avail = availability.get(`${input.start}|${input.end}`);
    if (line.problem || !avail) {
      return { ...base, addOns: line.addOns.map((a) => ({ ...a, pickupOk: false, shippingOk: false })), pickupOk: false, shippingOk: false };
    }
    const key = `${input.styleId}|${input.size}|${input.start}|${input.end}`;
    const n = need(key);
    const addOns = line.addOns.map((a) => {
      const m = need(`${a.id}|*|${input.start}|${input.end}`);
      return {
        ...a,
        pickupOk: countOf(avail.pickup, a.id, null) >= m,
        shippingOk: countOf(avail.shipping, a.id, null) >= m,
      };
    });
    return {
      ...base,
      addOns,
      pickupOk: countOf(avail.pickup, input.styleId, input.size) >= n && addOns.every((a) => a.pickupOk),
      shippingOk: countOf(avail.shipping, input.styleId, input.size) >= n && addOns.every((a) => a.shippingOk),
    };
  });

  return {
    lines: quoted,
    shippingMinDays: settings.shippingMinDays,
    shippingLeadDays: settings.paddings.shipping.leadDays,
    earliestShippingStart: earliestShippingStart(today, settings.paddings),
  };
}
