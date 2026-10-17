// 把 catalog/*.json 里的商品导入 Supabase：下载图片 → 上传到 style-images 存储桶 → 写入款式和库存。
// 用法：npm run import:catalog            已存在的款式（按 slug 判断）会跳过
//      npm run import:catalog -- --update  已存在的款式也重新上传图片并覆盖文字和价格
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BUCKET = "style-images";
const update = process.argv.includes("--update");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.log("❌ `.env.local` 里缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY。");
  process.exit(1);
}

const entrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug 只能用小写字母、数字和连字符"),
  brand: z.string().default(""),
  category: z.enum(["suit", "one_piece", "jacket", "pants"]),
  name: z.string().min(1),
  description: z.string().default(""),
  dailyPrice: z.number().nonnegative(),
  deposit: z.number().nonnegative(),
  sortOrder: z.number().int().default(0),
  sourceUrl: z.string().default(""),
  images: z.array(z.url()).min(1),
  items: z.array(z.object({ code: z.string().min(1), size: z.string().min(1) })).min(1),
});

const catalogDir = join(process.cwd(), "catalog");
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
  });

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function uploadImages(entry) {
  const urls = [];
  for (const [index, source] of entry.images.entries()) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`下载图片失败（${res.status}）：${source}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    const ext = extensions[type];
    if (!ext) throw new Error(`不支持的图片格式 ${type}：${source}`);
    const path = `${entry.slug}/${index + 1}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type, upsert: true });
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
  if (existing && !update) {
    skipped += 1;
    console.log(`⏭️  已存在，跳过：${entry.name}（${entry.slug}）`);
  } else {
    process.stdout.write(`⬆️  ${entry.name}：上传 ${entry.images.length} 张图片… `);
    const imageUrls = await uploadImages(entry);
    const row = {
      slug: entry.slug,
      brand: entry.brand,
      category: entry.category,
      name: entry.name,
      description: entry.description,
      daily_price_cents: Math.round(entry.dailyPrice * 100),
      deposit_cents: Math.round(entry.deposit * 100),
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
    { onConflict: "code", ignoreDuplicates: true },
  );
  if (itemsError) throw new Error(`写入库存失败（${entry.slug}）：${itemsError.message}`);
}

console.log(`\n全部完成 🎉 新增 ${created} 套，更新 ${updated} 套，跳过 ${skipped} 套。`);
