// 把一个已存在的 Supabase 用户设为网站管理员。
// 用法：npm run admin:add -- 你的邮箱
// 先在 Supabase 后台 Authentication → Users → Add user 里创建这个邮箱的账号（勾选 Auto Confirm User）。

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("❌ 请带上邮箱，例如：npm run admin:add -- you@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY，请先在 .env.local 里填好。");
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PER_PAGE = 200;
let user = null;
for (let page = 1; page <= 25 && !user; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
  if (error) {
    console.error(`❌ 读取用户列表失败：${error.message}`);
    process.exit(1);
  }
  user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < PER_PAGE) break;
}

if (!user) {
  console.error(`❌ 找不到邮箱为 ${email} 的用户。`);
  console.error("   请先在 Supabase 后台 Authentication → Users → Add user → Create new user 创建账号，");
  console.error("   并勾选 Auto Confirm User，然后再运行本命令。");
  process.exit(1);
}

const { error } = await supabase
  .from("admin_users")
  .upsert({ user_id: user.id, email }, { onConflict: "user_id" });
if (error) {
  console.error(`❌ 写入管理员名单失败：${error.message}`);
  process.exit(1);
}

console.log(`✅ ${email} 现在是管理员了。打开 /admin/login 登录即可。`);
