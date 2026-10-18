// 把 catalog/*.json 里的商品导入 Supabase：读取图片 → 压缩成 JPG → 上传到 style-images 存储桶 → 写入款式和库存。
// 用法：npm run import:catalog            已存在的款式（按 slug 判断）会跳过
//      npm run import:catalog -- --update  已存在的款式也重新上传图片并覆盖文字和价格
//      npm run import:catalog -- --text    已存在的款式只更新中英文名称和介绍（不传图片、不改价格）
//      加上 --only <slug>（多个用逗号隔开）只处理这几个款式，例如 --update --only cross-rhinestone-gloves
//
// 中英文：name / description 是中文，nameEn / descriptionEn 是英文，两种都要写（网站有中英两版）。
//
// 图片来源（三选一）：
//   1. images 里写网址：自动下载
//   2. images 里写本地路径（相对 catalog/ 文件夹），例如 "images/pink-bow/1.jpg"
//   3. 不写 images：自动使用 catalog/images/<slug>/ 文件夹里的全部图片，按文件名排序，第一张是封面
//
// 头盔套：category 写 "helmet_cover"，再填 tier（"regular" / "premium"），其余价格不填就用默认值：
//   单租 1 天 $15、2–3 天 $20、4–7 天 $25；搭配雪服加购 经典款 +$8、精选款 +$12；押金 0
//
// 手套：category 写 "gloves"，prices 是价目表（第 n 项 = 租 n 天的总价，之后沿用最后一项），
//   不填就是普通手套的 [10, 18, 25]（1 天 $10、2 天 $18、3 天及以上 $25）；押金不填为 0。
//   Crystal Collection（限量水钻款）：tags 写 ["crystal"]，价目表一般是 [15, 22, 22, 28]。
//
// 介绍模板：写 "template": "isee-migga"，description / descriptionEn 只写这一套的外观（一两句），
//   导入时自动接上 catalog/templates/isee-migga.md（英文是 isee-migga.en.md）里的「面料与科技」「设计细节」。
//   没有官网链接就不写 sourceUrl，图片放 catalog/images/<slug>/。示例见 catalog/templates/isee-migga.example.json
//
// 单件（Mix & Match）：category 写 "jacket"（外套）或 "pants"（雪裤），价格按全店的外套 / 雪裤价目表；
//   押金不填时外套 $150、雪裤 $100，dailyPrice 可以不填。
//
// 多个颜色：items 里每件写 size（例如 "芭比玫红 · S"）和 image（images 里的第几张，从 1 数），
//   顾客在详情页选这个颜色时会换到那张图。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { resolveDescription } from "./catalog-template.mjs";

const BUCKET = "style-images";
const update = process.argv.includes("--update");
const textOnly = process.argv.includes("--text");
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? new Set((process.argv[onlyIndex + 1] ?? "").split(",").filter(Boolean)) : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.log("❌ `.env.local` 里缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY。");
  process.exit(1);
}

const ACCESSORIES = new Set(["helmet_cover", "gloves"]);
/** 单件的默认起租价和押金（美元），与 settings 里的外套 / 雪裤价目表第 1 档一致 */
const SEPARATES = { jacket: { dailyPrice: 35, deposit: 150 }, pants: { dailyPrice: 25, deposit: 100 } };

const entrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug 只能用小写字母、数字和连字符"),
  brand: z.string().default(""),
  category: z.enum(["suit", "one_piece", "jacket", "pants", "helmet_cover", "gloves"]),
  name: z.string().min(1),
  nameEn: z.string().min(1, "要填英文名称 nameEn"),
  description: z.string().default(""),
  descriptionEn: z.string().default(""),
  template: z.string().regex(/^[a-z0-9-]+$/).optional(),
  dailyPrice: z.number().nonnegative().optional(),
  deposit: z.number().nonnegative().optional(),
  // 以下只用于头盔套
  tier: z.enum(["regular", "premium"]).optional(),
  tags: z.array(z.string()).default([]),
  standalonePrices: z
    .object({ oneDay: z.number().nonnegative(), twoToThreeDays: z.number().nonnegative(), fourToSevenDays: z.number().nonnegative() })
    .optional(),
  addOnPrice: z.number().nonnegative().optional(),
  // 只用于手套
  prices: z.array(z.number().nonnegative()).min(1).max(31).optional(),
  replacementValue: z.number().nonnegative().optional(),
  sortOrder: z.number().int().default(0),
  sourceUrl: z.string().default(""),
  images: z.array(z.string().min(1)).default([]),
  items: z
    .array(
      z.object({
        code: z.string().min(1),
        size: z.string().min(1).default("均码"),
        image: z.number().int().min(1).optional(),
      }),
    )
    .min(1),
}).superRefine((entry, ctx) => {
  if (entry.category === "helmet_cover" && !entry.tier) {
    ctx.addIssue({ code: "custom", path: ["tier"], message: "头盔套要填 tier：regular 或 premium" });
  }
  for (const [index, item] of entry.items.entries()) {
    const count = entry.images.length;
    if (item.image !== undefined && count > 0 && item.image > count) {
      ctx.addIssue({ code: "custom", path: ["items", index, "image"], message: `只有 ${count} 张图` });
    }
  }
  if (!ACCESSORIES.has(entry.category) && !SEPARATES[entry.category] && (entry.dailyPrice === undefined || entry.deposit === undefined)) {
    ctx.addIssue({ code: "custom", path: ["dailyPrice"], message: "雪服要填 dailyPrice 和 deposit" });
  }
});

const cents = (dollars) => Math.round(dollars * 100);

/** 头盔套的价格字段（雪服返回空对象，沿用全店价目表） */
function helmetFields(entry) {
  if (entry.category !== "helmet_cover") return {};
  const p = entry.standalonePrices ?? { oneDay: 15, twoToThreeDays: 20, fourToSevenDays: 25 };
  return {
    tier: entry.tier,
    tags: entry.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    rental_prices_cents: [cents(p.oneDay), cents(p.twoToThreeDays), cents(p.twoToThreeDays), cents(p.fourToSevenDays)],
    addon_price_cents: cents(entry.addOnPrice ?? (entry.tier === "premium" ? 12 : 8)),
    replacement_value_cents: entry.replacementValue === undefined ? null : cents(entry.replacementValue),
  };
}

/** 手套的价目表（雪服、头盔套返回空对象） */
function glovesFields(entry) {
  if (entry.category !== "gloves") return {};
  const prices = entry.prices ?? [10, 18, 25];
  return {
    tags: entry.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    rental_prices_cents: prices.map(cents),
    replacement_value_cents: entry.replacementValue === undefined ? null : cents(entry.replacementValue),
  };
}

/** 每个颜色 / 尺码对应 image_urls 里的第几张（从 0 开始） */
function variantImages(entry) {
  return Object.fromEntries(entry.items.flatMap((item) => (item.image ? [[item.size, item.image - 1]] : [])));
}

const catalogDir = join(process.cwd(), "catalog");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".heif", ".gif", ".tif", ".tiff"]);
const entries = readdirSync(catalogDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((file) => {
    const parsed = z.array(entrySchema).safeParse(JSON.parse(readFileSync(join(catalogDir, file), "utf8")));
    if (!parsed.success) {
      console.log(`❌ ${file} 格式有误：\n${z.prettifyError(parsed.error)}`);
      process.exit(1);
    }
    return parsed.data;
  })
  .filter((entry) => !only || only.has(entry.slug));

if (only && entries.length === 0) {
  console.log(`❌ 没有找到 --only 指定的款式：${[...only].join(", ")}`);
  process.exit(1);
}

// 先检查模板都在，免得传了一半图片才报错
for (const entry of entries) {
  try {
    resolveDescription(entry, catalogDir);
    resolveDescription(entry, catalogDir, "en");
  } catch (error) {
    console.log(`❌ ${error.message}`);
    process.exit(1);
  }
}

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });

/** 这个款式要上传的图片：images 里写的网址/本地路径，没写就用 catalog/images/<slug>/ 里的全部图片 */
function imageSources(entry) {
  if (entry.images.length > 0) return entry.images;
  const folder = join(catalogDir, "images", entry.slug);
  if (!existsSync(folder)) {
    throw new Error(`${entry.slug} 没有填 images，也没有找到图片文件夹 catalog/images/${entry.slug}/`);
  }
  const files = readdirSync(folder)
    .filter((f) => imageExtensions.has(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  if (files.length === 0) throw new Error(`catalog/images/${entry.slug}/ 里没有图片`);
  return files.map((f) => join("images", entry.slug, f));
}

async function readImage(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`下载图片失败（${res.status}）：${source}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const file = join(catalogDir, source);
  if (!existsSync(file)) throw new Error(`找不到图片文件：catalog/${source}`);
  return readFileSync(file);
}

/** 统一压成长边不超过 2000px 的 JPG（存储桶单张上限 5MB），并按照片方向自动转正 */
async function toJpeg(buffer, source) {
  const encode = (input) =>
    sharp(input)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  try {
    return await encode(buffer);
  } catch (error) {
    // iPhone 的 HEIC 照片 sharp 读不了，在 Mac 上借系统自带的 sips 先转成 JPG
    if (process.platform !== "darwin") throw new Error(`读不了这张图片（${error.message}）：${source}`);
    const dir = mkdtempSync(join(tmpdir(), "sunny-closet-"));
    try {
      const input = join(dir, "input");
      const output = join(dir, "output.jpg");
      writeFileSync(input, buffer);
      execFileSync("sips", ["-s", "format", "jpeg", input, "--out", output], { stdio: "ignore" });
      return await encode(readFileSync(output));
    } catch {
      throw new Error(`读不了这张图片，请另存为 JPG 再试：${source}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

async function uploadImages(entry) {
  const urls = [];
  for (const [index, source] of imageSources(entry).entries()) {
    const jpeg = await toJpeg(await readImage(source), source);
    const path = `${entry.slug}/${index + 1}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`上传图片失败：${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(`${data.publicUrl}?v=${Date.now()}`);
  }
  return urls;
}

let created = 0;
let updated = 0;
let skipped = 0;

for (const entry of entries) {
  const { data: existing, error: findError } = await supabase
    .from("styles")
    .select("id")
    .eq("slug", entry.slug)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  let styleId = existing?.id;
  if (existing && textOnly) {
    const { error } = await supabase
      .from("styles")
      .update({
        name: entry.name,
        name_en: entry.nameEn,
        description: resolveDescription(entry, catalogDir),
        description_en: resolveDescription(entry, catalogDir, "en"),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`更新文字失败（${entry.slug}）：${error.message}`);
    updated += 1;
    console.log(`📝 已更新文字：${entry.name}（${entry.slug}）`);
  } else if (existing && !update) {
    skipped += 1;
    console.log(`⏭️  已存在，跳过：${entry.name}（${entry.slug}）`);
  } else {
    process.stdout.write(`⬆️  ${entry.name}：上传 ${imageSources(entry).length} 张图片… `);
    const imageUrls = await uploadImages(entry);
    const row = {
      slug: entry.slug,
      brand: entry.brand,
      category: entry.category,
      name: entry.name,
      name_en: entry.nameEn,
      description: resolveDescription(entry, catalogDir),
      description_en: resolveDescription(entry, catalogDir, "en"),
      daily_price_cents: cents(
        entry.dailyPrice ?? SEPARATES[entry.category]?.dailyPrice ?? entry.prices?.[0] ?? entry.standalonePrices?.oneDay ?? 15,
      ),
      deposit_cents: cents(entry.deposit ?? SEPARATES[entry.category]?.deposit ?? 0),
      ...helmetFields(entry),
      ...glovesFields(entry),
      variant_images: variantImages(entry),
      sort_order: entry.sortOrder,
      source_url: entry.sourceUrl,
      image_urls: imageUrls,
    };
    const { data, error } = await supabase.from("styles").upsert(row, { onConflict: "slug" }).select("id").single();
    if (error) throw new Error(`写入款式失败：${error.message}`);
    styleId = data.id;
    if (existing) updated += 1;
    else created += 1;
    console.log("完成");
  }

  const { error: itemsError } = await supabase.from("inventory_items").upsert(
    entry.items.map((item) => ({ style_id: styleId, code: item.code, size: item.size })),
    { onConflict: "code" },
  );
  if (itemsError) throw new Error(`写入库存失败（${entry.slug}）：${itemsError.message}`);
}

console.log(`\n全部完成 🎉 新增 ${created} 套，更新 ${updated} 套，跳过 ${skipped} 套。`);
