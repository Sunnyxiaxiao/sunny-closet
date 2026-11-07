import { describe, expect, it } from "vitest";
import { confirmedEmail } from "@/lib/account/confirmed-email";

describe("按邮箱认领访客订单：邮箱必须已确认", () => {
  it("已确认的邮箱可以用来匹配（统一小写）", () => {
    expect(confirmedEmail({ email: "Guest@Example.com", email_confirmed_at: "2026-11-01T00:00:00Z" })).toBe(
      "guest@example.com",
    );
  });

  it("邮箱还没确认：不能匹配任何订单", () => {
    expect(confirmedEmail({ email: "guest@example.com", email_confirmed_at: null })).toBeNull();
    expect(confirmedEmail({ email: "guest@example.com" })).toBeNull();
  });

  it("没有用户、没有邮箱：不能匹配", () => {
    expect(confirmedEmail(null)).toBeNull();
    expect(confirmedEmail({ email: "", email_confirmed_at: "2026-11-01T00:00:00Z" })).toBeNull();
    expect(confirmedEmail({ email: null, email_confirmed_at: "2026-11-01T00:00:00Z" })).toBeNull();
  });
});
