// 把 supabase/migrations 下的迁移文件和 seed.sql 写入 Supabase 数据库。用法：npm run db:setup
// 已执行过的迁移会记录在 supabase_migrations.schema_migrations 中，重复运行会自动跳过。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.log("❌ `.env.local` 里还没有填写 SUPABASE_DB_URL。");
  process.exit(1);
}
if (dbUrl.includes("[YOUR-PASSWORD]")) {
  console.log("❌ SUPABASE_DB_URL 里的 [YOUR-PASSWORD] 还没有替换成你的数据库密码（方括号也要删掉）。");
  process.exit(1);
}

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (error) {
  console.log(`❌ 连接数据库失败：${error.message}`);
  console.log("   请检查：1) 密码正确（忘记可在 Project Settings → Database 重置）；");
  console.log("          2) 如果提示网络/地址错误，改用 Connect → Direct → Session pooler 的地址。");
  process.exit(1);
}
console.log("✅ 已连接到数据库");

try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);

  const applied = new Set(
    (await client.query("select version from supabase_migrations.schema_migrations")).rows.map(
      (r) => r.version,
    ),
  );

  for (const file of files) {
    const [version, ...nameParts] = file.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) {
      console.log(`⏭️  已执行过，跳过：${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, nameParts.join("_"), [sql]],
      );
      await client.query("commit");
      console.log(`✅ 已执行：${file}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${file} 执行失败：${error.message}`);
    }
  }

  await client.query(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  console.log("✅ 已导入演示数据：seed.sql");

  const { rows } = await client.query(
    "select (select count(*) from public.styles)::int as styles, (select count(*) from public.inventory_items)::int as items",
  );
  console.log(`\n全部完成 🎉 当前共有 ${rows[0].styles} 个款式、${rows[0].items} 件库存。`);
} catch (error) {
  console.log(`❌ ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
