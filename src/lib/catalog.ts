import "server-only";
import { connection } from "next/server";
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
 * 前台读取商品与可用性的唯一入口（匿名身份，受 RLS 约束）。
 * 每个函数先调用 connection()，表示数据在请求时实时读取，不在构建时预渲染。
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

const STYLE_COLUMNS =
  "id, slug, brand, category, name, description, daily_price_cents, deposit_cents, image_urls, source_url, tier, tags, addon_price_cents, replacement_value_cents, rental_prices_cents, variant_images, bundle_style_ids, name_en, description_en";

type StyleRowWithEnglish = PublicStyle & Pick<StyleRow, "name_en" | "description_en">;

/** 英文页面用英文名称和介绍（没填英文时退回中文） */
function localize({ name_en, description_en, ...style }: StyleRowWithEnglish, locale: Locale): PublicStyle {
  if (locale !== "en") return style;
  return { ...style, name: name_en || style.name, description: description_en || style.description };
}

/** 款式分三类：雪服（成套 / 连体服 / 上衣 / 裤子）、头盔套、手套 */
export type StyleKind = "outfit" | "helmet_cover" | "gloves";

const ACCESSORY_CATEGORIES = [HELMET_COVER_CATEGORY, GLOVES_CATEGORY] as const;

export function styleKind(category: StyleRow["category"]): StyleKind {
  return (ACCESSORY_CATEGORIES as readonly string[]).includes(category)
    ? (category as (typeof ACCESSORY_CATEGORIES)[number])
    : "outfit";
}

/** 这个品类最长能租几天：手套单独算，其它都按 maxRentalDays */
export function maxRentalDaysFor(
  category: StyleRow["category"],
  settings: Pick<ShopSettings, "maxRentalDays" | "glovesMaxRentalDays">,
) {
  return category === "gloves" ? settings.glovesMaxRentalDays : settings.maxRentalDays;
}

export interface ShopSettings {
  bufferDays: number;
  maxRentalDays: number;
  /** 单租手套最长几天（手套 3 天起封顶，不限天数就可能被租一整个雪季） */
  glovesMaxRentalDays: number;
  /** 完整套装的价目表：第 n 项是租 n 天的总租金（美分），超出的天数用最后一档 */
  rentalPricesCents: number[];
  /** Mix & Match：只租外套 / 只租雪裤的价目表 */
  jacketPricesCents: number[];
  pantsPricesCents: number[];
  /** Crystal Collection 雪服的正价表（成套 / 上衣 / 雪裤） */
  crystalPricesCents: number[];
  crystalJacketPricesCents: number[];
  crystalPantsPricesCents: number[];
  /** 感恩节 & 圣诞特惠截止日（含当天）；为空表示没有特惠 */
  crystalPromoEndsOn: IsoDate | null;
  /** 今天（店铺时区）是否在特惠期内：是就按普通价收，正价划掉 */
  crystalPromoActive: boolean;
  /** 邮寄的最短租期（天） */
  shippingMinDays: number;
  /** 到店自取 / 邮寄在滑雪日前后各占用几天库存（不收费） */
  paddings: FulfillmentPaddings;
}

export interface SizeAvailability {
  size: string;
  total: number;
  /** 未指定日期时等于 total */
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

export async function getSettings(): Promise<ShopSettings> {
  await connection();
  const { data, error } = await createSupabasePublicClient()
    .from("settings")
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw new Error(`读取店铺设置失败：${error.message}`);
  return toShopSettings(data);
}

/**
 * 上架的款式。默认只列雪服；头盔套传 kind: "helmet_cover"，手套传 kind: "gloves"。名称和介绍按 locale 返回。
 * “上衣 + 黑色雪裤”套装不单独展示（在上衣页面里当选项），要用时传 withPantsOptions: true
 */
export async function listStyles({
  kind = "outfit",
  locale = "zh",
  withPantsOptions = false,
}: { kind?: StyleKind; locale?: Locale; withPantsOptions?: boolean } = {}): Promise<PublicStyle[]> {
  await connection();
  const query = createSupabasePublicClient().from("styles").select(STYLE_COLUMNS).eq("is_active", true);
  const { data, error } = await (kind === "outfit"
    ? query.not("category", "in", `(${ACCESSORY_CATEGORIES.join(",")})`)
    : query.eq("category", kind)
  )
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`读取款式失败：${error.message}`);
  return data
    .filter((row) => withPantsOptions || !row.tags.includes(WITH_PANTS_TAG))
    .map((row) => localize(row, locale));
}

export async function getStyleBySlug(
  slug: string,
  { kind = "outfit", locale = "zh" }: { kind?: StyleKind; locale?: Locale } = {},
): Promise<PublicStyle | null> {
  await connection();
  const { data, error } = await createSupabasePublicClient()
    .from("styles")
    .select(STYLE_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`读取款式失败：${error.message}`);
  if (!data || styleKind(data.category) !== kind) return null;
  return localize(data, locale);
}

/**
 * 这个款式按哪张价目表计价：有自己的价目表就用自己的（头盔套、手套），
 * 否则按品类：外套 / 雪裤用 Mix & Match 价目表，成套和连体服用完整套装价目表。
 * 例外：背带雪裤（bib 标签）按外套价，卫衣（hoodie 标签）按雪裤价。
 * Crystal Collection 雪服有自己的正价表，特惠期内按普通价收（见 crystalRegularTable）。
 * 数据库的 style_rental_price_cents 是同样的规则，下单时会再校验一次。
 */
export function stylePriceTable(style: PricedStyle, settings: PriceSettings): number[] {
  if (style.rental_prices_cents) return style.rental_prices_cents;
  const kind = priceKind(style);
  if (isCrystal(style) && !settings.crystalPromoActive) return crystalTables(settings)[kind];
  return { suit: settings.rentalPricesCents, jacket: settings.jacketPricesCents, pants: settings.pantsPricesCents }[kind];
}

/** 特惠期内 Crystal 雪服的正价表（页面上划掉显示）；不在特惠期或不是 Crystal 雪服时为 null */
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

/** 按哪一类计价：背带雪裤算上衣，卫衣算雪裤，其余雪服算成套 */
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
 * 同款不同色：带同一个 series: 标签的款式（例如 series:isee-cross），详情页互相显示为“同款其他颜色”。
 * 可以是整套和单件上衣混着（某个颜色只有上衣）。
 */
export function sameSeries<T extends Pick<PublicStyle, "id" | "tags">>(style: T, all: T[]): T[] {
  const series = style.tags.filter((tag) => tag.startsWith("series:"));
  if (series.length === 0) return [];
  return all.filter((s) => s.id !== style.id && s.tags.some((tag) => series.includes(tag)));
}

/** 背带雪裤按外套价、卫衣按雪裤价（见 stylePriceTable） */
export const BIB_TAG = "bib";
export const HOODIE_TAG = "hoodie";
/**
 * 只有上衣的款式出的“上衣 + 随机黑色滑雪裤”套装（只含 1 件单品的组合套装）。
 * 不单独展示，是上衣页面下单时的一个选项：按套装价收费，占用那件上衣的库存
 */
export const WITH_PANTS_TAG = "with-black-pants";

/** 外套、雪裤单租（Mix & Match 区） */
export function isSeparate(style: Pick<PublicStyle, "category">) {
  return style.category === "jacket" || style.category === "pants";
}

/** 每个款式在这段时间（不传日期则不看排期）一共有几件可租，用于头盔套这类不分尺码的款式 */
export function availableCounts(availability: Map<string, SizeAvailability[]>): Map<string, number> {
  return new Map(
    [...availability].map(([styleId, sizes]) => [styleId, sizes.reduce((sum, s) => sum + s.available, 0)]),
  );
}

/**
 * 返回 款式 id → 各尺码可租件数。传入日期（滑雪日）时按排期计算：
 * 含取件方式对应的前置 / 后置天数和清洁缓冲，默认按到店自取（占用时间最短）。
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
