import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationsDir = join(root, "supabase", "migrations");
export const demoSeedPath = join(root, "tests", "fixtures", "demo-seed.sql");

function readSql(path: string) {
  return readFileSync(path, "utf8");
}

export function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(migrationsDir, f));
}

export async function createTestDb(options: { seed?: boolean } = {}) {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readSql(join(root, "tests", "db", "supabase-shim.sql")));
  for (const file of migrationFiles()) {
    await db.exec(readSql(file));
  }
  if (options.seed) {
    await db.exec(readSql(demoSeedPath));
  }
  return db;
}

type Role = "anon" | "authenticated" | "service_role";

/** 以指定数据库角色（及可选的登录用户 id）执行，结束后恢复为超级用户。 */
export async function withRole<T>(
  db: PGlite,
  role: Role,
  fn: () => Promise<T>,
  userId?: string,
): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
