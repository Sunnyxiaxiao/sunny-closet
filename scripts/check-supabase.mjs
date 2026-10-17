// 检查 .env.local 是否填写正确、数据库是否已建好。用法：npm run check:supabase
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

let failed = false;
const ok = (msg) => console.log(`✅ ${msg}`);
const bad = (msg) => {
  failed = true;
  console.log(`❌ ${msg}`);
};

if (!url || !publishableKey || !secretKey) {
  bad("`.env.local` 里还有变量没填：" +
    [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      !secretKey && "SUPABASE_SECRET_KEY",
    ].filter(Boolean).join("、"));
  process.exit(1);
}

const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
const service = createClient(url, secretKey, { auth: { persistSession: false } });

const styles = await anon.from("styles").select("slug");
if (styles.error) {
  bad(`读取款式失败：${styles.error.message}（是否已在 SQL Editor 中运行全部迁移文件？）`);
} else if (styles.data.length === 0) {
  bad("款式表是空的（是否已运行 supabase/seed.sql？）");
} else {
  ok(`访客可以读取款式：共 ${styles.data.length} 个`);
}

const availability = await anon.rpc("get_availability");
if (availability.error) {
  bad(`可用性查询失败：${availability.error.message}`);
} else {
  ok(`可用性查询正常：共 ${availability.data.length} 个“款式 × 尺码”组合`);
}

const anonBookings = await anon.from("bookings").select("id").limit(1);
if (anonBookings.error) {
  ok("访客无法读取订单（安全规则生效）");
} else if (anonBookings.data.length === 0) {
  ok("访客读取订单得到空结果（安全规则生效）");
} else {
  bad("访客竟然读到了订单！请检查是否运行了 20261017000002_security.sql");
}

const serviceBookings = await service.from("bookings").select("id", { count: "exact", head: true });
if (serviceBookings.error) {
  bad(`Secret key 无法访问订单表：${serviceBookings.error.message}（请检查 SUPABASE_SECRET_KEY）`);
} else {
  ok(`服务端密钥正常：当前共有 ${serviceBookings.count} 条订单`);
}

const bucket = await service.storage.getBucket("style-images");
if (bucket.error) {
  bad(`找不到图片存储桶 style-images：${bucket.error.message}（是否运行了 20261017000003_storage.sql？）`);
} else {
  ok("图片存储桶 style-images 已就绪");
}

console.log(failed ? "\n有检查未通过，请按提示修正后再运行一次。" : "\n全部检查通过 🎉");
process.exit(failed ? 1 : 0);
