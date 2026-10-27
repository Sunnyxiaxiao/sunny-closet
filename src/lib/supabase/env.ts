function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `缺少环境变量 ${name}。请对照 .env.example 在项目根目录的 .env.local 中填写，然后重启 npm run dev。`,
    );
  }
  return value;
}

// NEXT_PUBLIC_ variables must be accessed literally so Next.js can inline them into browser code at build time.
export function getPublicSupabaseEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function getSecretKey() {
  return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}
