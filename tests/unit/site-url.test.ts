import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 认证邮件和订单邮件里的链接：正式环境只用 NEXT_PUBLIC_SITE_URL，不信请求头
const forged = new Headers({ host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => forged }));

const { publicOrigin } = await import("@/lib/site-url");

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("邮件链接用的网址", () => {
  it("正式环境：伪造的转发头不影响，用设置好的正式网址", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sssunnycloset.com/");
    expect(await publicOrigin()).toBe("https://sssunnycloset.com");
  });

  it("正式环境没设置正式网址：直接报错，不回退到请求头", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(publicOrigin()).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("本地开发没设置：用请求的地址", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(await publicOrigin()).toBe("https://evil.example");
  });
});
