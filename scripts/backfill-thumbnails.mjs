// 给存储桶里已有的商品图补小图，并把缓存时间改成一年。用法：npm run images:backfill
// 每张 xxx.jpg 旁边生成一张宽 ≤ 600px 的 xxx.sm.jpg（列表卡片、缩略图用，见 src/lib/images.ts）。
// 已经有小图的跳过；可以重复运行。新上传的图（导入脚本、后台上传）会自动带小图，不需要再跑。
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "style-images";
const THUMB_WIDTH = 600;
const CACHE_SECONDS = "31536000";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.log("❌ `.env.local` 里缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY。");
  process.exit(1);
}
const supabase = createClient(url, secretKey, { auth: { persistSession: false } });

async function listAll(prefix = "") {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`读取图片列表失败：${error.message}`);
  const paths = [];
  for (const o of data) {
    const path = prefix ? `${prefix}/${o.name}` : o.name;
    // 文件夹没有 id
    if (o.id === null) paths.push(...(await listAll(path)));
    else paths.push(path);
  }
  return paths;
}

const paths = new Set(await listAll());
const originals = [...paths].filter((p) => p.endsWith(".jpg") && !p.endsWith(".sm.jpg"));
let done = 0;
for (const path of originals) {
  const thumbPath = path.replace(/\.jpg$/, ".sm.jpg");
  if (paths.has(thumbPath)) continue;
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`下载失败（${path}）：${error.message}`);
  const jpeg = Buffer.from(await blob.arrayBuffer());
  const thumb = await sharp(jpeg)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  const options = { contentType: "image/jpeg", cacheControl: CACHE_SECONDS, upsert: true };
  // 先传小图；大图内容不变，重新上传只是为了带上一年的缓存时间
  for (const [p, body] of [[thumbPath, thumb], [path, jpeg]]) {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(p, body, options);
    if (uploadError) throw new Error(`上传失败（${p}）：${uploadError.message}`);
  }
  done += 1;
  process.stdout.write(`\r已处理 ${done} 张`);
}
console.log(`\n全部完成 🎉 补了 ${done} 张小图，共 ${originals.length} 张大图。`);
