import { describe, expect, it } from "vitest";
import { contactMessageEmail } from "@/lib/email/templates";
import { CONTACT_LIMITS, parseContactMessage } from "@/lib/validation/contact-message";

describe("联系页留言", () => {
  it("去掉首尾空格，邮箱转小写", () => {
    expect(parseContactMessage({ name: " Amy ", email: " Amy@Example.com ", message: " Do you have size S? " })).toEqual({
      ok: true,
      message: { name: "Amy", email: "amy@example.com", message: "Do you have size S?" },
    });
  });

  it("指出哪些栏有问题", () => {
    expect(parseContactMessage({ name: "", email: "not-an-email", message: "hi" })).toEqual({ ok: false, fields: ["name", "email"] });
    expect(parseContactMessage({ name: "Amy", email: "amy@example.com", message: "   " })).toEqual({ ok: false, fields: ["message"] });
    expect(parseContactMessage({ name: "Amy", email: "amy@example.com" })).toEqual({ ok: false, fields: ["message"] });
  });

  it("太长的内容不收", () => {
    const long = "x".repeat(CONTACT_LIMITS.message + 1);
    expect(parseContactMessage({ name: "Amy", email: "amy@example.com", message: long })).toEqual({ ok: false, fields: ["message"] });
  });

  it("邮件发给店主，回复直接到顾客；内容里的 HTML 不会被当成代码", () => {
    const email = contactMessageEmail(
      { name: "Amy", email: "amy@example.com", message: "Hi <b>there</b>\nSize S?", language: "en" },
      { to: "shop@example.com" },
    );
    expect(email.to).toBe("shop@example.com");
    expect(email.replyTo).toBe("amy@example.com");
    expect(email.subject).toBe("Website message from Amy");
    expect(email.text).toContain("Hi <b>there</b>\nSize S?");
    expect(email.html).toContain("Hi &lt;b&gt;there&lt;/b&gt;<br>Size S?");
    expect(email.html).not.toContain("<b>there</b>");
  });

  it("称呼里的换行不会进到邮件标题", () => {
    const email = contactMessageEmail(
      { name: "Amy\r\nBcc: x@example.com", email: "amy@example.com", message: "hi", language: "zh" },
      { to: "shop@example.com" },
    );
    expect(email.subject).toBe("Website message from Amy Bcc: x@example.com");
  });
});
