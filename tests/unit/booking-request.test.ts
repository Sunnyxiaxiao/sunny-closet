import { describe, expect, it } from "vitest";
import {
  bookingRequestSchema,
  buildCustomerNote,
  firstFieldErrors,
} from "@/lib/validation/booking-request";

const valid = {
  styleId: "7b0e9d0e-3b53-4b0f-8f6a-0f0f3d1d4d11",
  size: "M",
  start: "2027-01-10",
  end: "2027-01-12",
  name: "小王",
  phone: "(555) 123-4567",
  email: "wang@example.com",
  wechat: "",
  fulfillment: "pickup",
  shippingAddress: "",
  note: "",
};

function errorsFor(input: Record<string, unknown>) {
  const result = bookingRequestSchema.safeParse(input);
  if (result.success) throw new Error("本应校验失败，但通过了");
  return firstFieldErrors(result.error);
}

describe("预订表单校验", () => {
  it("合法输入通过，并去掉首尾空格、邮箱转小写", () => {
    const result = bookingRequestSchema.safeParse({
      ...valid,
      name: "  小王 ",
      email: " Wang@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("小王");
      expect(result.data.email).toBe("wang@example.com");
    }
  });

  it("可选字段不传时默认为空字符串", () => {
    const { wechat, shippingAddress, note, ...rest } = valid;
    void wechat;
    void shippingAddress;
    void note;
    const result = bookingRequestSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wechat).toBe("");
      expect(result.data.note).toBe("");
    }
  });

  it("邮箱和手机号格式不对时分别报错", () => {
    const errors = errorsFor({ ...valid, email: "not-an-email", phone: "abc" });
    expect(errors.email).toBe("邮箱格式不正确");
    expect(errors.phone).toBe("请填写正确的手机号");
  });

  it("姓名不能为空", () => {
    expect(errorsFor({ ...valid, name: "   " }).name).toBe("请填写姓名");
  });

  it("邮寄时必须填写完整地址", () => {
    expect(errorsFor({ ...valid, fulfillment: "shipping", shippingAddress: "" }).shippingAddress).toBe(
      "请填写完整的邮寄地址",
    );
    const ok = bookingRequestSchema.safeParse({
      ...valid,
      fulfillment: "shipping",
      shippingAddress: "1 Main St, Ithaca, NY 14850",
    });
    expect(ok.success).toBe(true);
  });

  it("到店自取不需要地址", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, fulfillment: "pickup" }).success).toBe(true);
  });

  it("取件方式只能是 pickup 或 shipping", () => {
    expect(errorsFor({ ...valid, fulfillment: "drone" }).fulfillment).toBeDefined();
  });

  it("款式 id 必须是 uuid", () => {
    expect(errorsFor({ ...valid, styleId: "abc" }).styleId).toBe("款式不正确");
  });

  it("不存在的日历日期会被拒绝", () => {
    expect(errorsFor({ ...valid, start: "2027-02-30" }).start).toBe("第一个滑雪日不正确");
  });

  it("备注最多 500 个字符", () => {
    expect(errorsFor({ ...valid, note: "字".repeat(501) }).note).toBe("备注太长了");
    expect(bookingRequestSchema.safeParse({ ...valid, note: "字".repeat(500) }).success).toBe(true);
  });
});

describe("buildCustomerNote", () => {
  it("微信号和备注合并，空的部分省略", () => {
    expect(buildCustomerNote({ wechat: "", note: "" })).toBe("");
    expect(buildCustomerNote({ wechat: "abc123", note: "" })).toBe("微信号：abc123");
    expect(buildCustomerNote({ wechat: "", note: "身高 165" })).toBe("身高 165");
    expect(buildCustomerNote({ wechat: "abc123", note: "身高 165" })).toBe(
      "微信号：abc123\n身高 165",
    );
  });
});
