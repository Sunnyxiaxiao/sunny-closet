import { describe, expect, it } from "vitest";
import {
  cartLinesSchema,
  checkoutSchema,
  buildCustomerNote,
  firstFieldErrors,
} from "@/lib/validation/booking-request";

const valid = {
  name: "小王",
  phone: "(555) 123-4567",
  email: "wang@example.com",
  wechat: "",
  fulfillment: "pickup",
  note: "",
};

const shippingAddress = {
  fulfillment: "shipping",
  shippingStreet: "1 Main St",
  shippingCity: "Ithaca",
  shippingState: "NY",
  shippingZip: "14850",
};

function errorsFor(input: Record<string, unknown>) {
  const result = checkoutSchema.safeParse(input);
  if (result.success) throw new Error("本应校验失败，但通过了");
  return firstFieldErrors(result.error);
}

describe("预订表单校验", () => {
  it("合法输入通过，并去掉首尾空格、邮箱转小写", () => {
    const result = checkoutSchema.safeParse({
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
    const { wechat, note, ...rest } = valid;
    void wechat;
    void note;
    const result = checkoutSchema.safeParse(rest);
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

  it("邮寄时街道、城市、州、邮编都要填", () => {
    const errors = errorsFor({ ...valid, fulfillment: "shipping" });
    expect(errors.shippingStreet).toBe("请填写街道地址");
    expect(errors.shippingCity).toBe("请填写城市");
    expect(errors.shippingState).toBe("请选择州（仅限美国本土 48 州和华盛顿特区）");
    expect(errors.shippingZip).toBe("请填写 5 位邮编，例如 14850");

    const ok = checkoutSchema.safeParse({ ...valid, ...shippingAddress });
    expect(ok.success).toBe(true);
  });

  it("州只能选本土 48 州和 DC：阿拉斯加、夏威夷、波多黎各都不行；小写会转成大写", () => {
    for (const state of ["AK", "HI", "PR", "XX"]) {
      expect(errorsFor({ ...valid, ...shippingAddress, shippingState: state }).shippingState).toBeDefined();
    }
    const dc = checkoutSchema.safeParse({ ...valid, ...shippingAddress, shippingState: "dc" });
    expect(dc.success && dc.data.shippingState).toBe("DC");
  });

  it("邮编：5 位或 5+4 位", () => {
    expect(checkoutSchema.safeParse({ ...valid, ...shippingAddress, shippingZip: "14850-1234" }).success).toBe(
      true,
    );
    for (const zip of ["1485", "148500", "ABCDE", "14850-12"]) {
      expect(errorsFor({ ...valid, ...shippingAddress, shippingZip: zip }).shippingZip).toBeDefined();
    }
  });

  it("到店自取不需要地址", () => {
    expect(checkoutSchema.safeParse({ ...valid, fulfillment: "pickup" }).success).toBe(true);
  });

  it("取件方式只能是 pickup 或 shipping", () => {
    expect(errorsFor({ ...valid, fulfillment: "drone" }).fulfillment).toBeDefined();
  });

  it("备注最多 500 个字符", () => {
    expect(errorsFor({ ...valid, note: "字".repeat(501) }).note).toBe("备注太长了");
    expect(checkoutSchema.safeParse({ ...valid, note: "字".repeat(500) }).success).toBe(true);
  });
});

describe("购物车内容 cartLinesSchema", () => {
  const line = {
    id: "line-1",
    styleId: "7b0e9d0e-3b53-4b0f-8f6a-0f0f3d1d4d11",
    size: "M",
    start: "2027-01-10",
    end: "2027-01-12",
    addOnIds: [],
  };

  it("合法的购物车通过；加购不传时默认没有", () => {
    const { addOnIds, ...noAddOns } = line;
    void addOnIds;
    const parsed = cartLinesSchema.safeParse([noAddOns, { ...line, id: "line-2" }]);
    expect(parsed.success && parsed.data[0].addOnIds).toEqual([]);
  });

  it("不能是空的，最多 10 件", () => {
    expect(cartLinesSchema.safeParse([]).success).toBe(false);
    expect(cartLinesSchema.safeParse(Array.from({ length: 10 }, (_, i) => ({ ...line, id: `l${i}` }))).success).toBe(
      true,
    );
    expect(cartLinesSchema.safeParse(Array.from({ length: 11 }, (_, i) => ({ ...line, id: `l${i}` }))).success).toBe(
      false,
    );
  });

  it("款式 id、日期格式不对的件会被拒绝；一件雪服最多加购一顶头盔套，不能重复", () => {
    expect(cartLinesSchema.safeParse([{ ...line, styleId: "abc" }]).success).toBe(false);
    expect(cartLinesSchema.safeParse([{ ...line, start: "2027-02-30" }]).success).toBe(false);
    const helmet = "8b7fed66-6e3d-419c-a11f-71fadcf6437d";
    expect(cartLinesSchema.safeParse([{ ...line, addOnIds: [helmet] }]).success).toBe(true);
    expect(cartLinesSchema.safeParse([{ ...line, addOnIds: [helmet, helmet] }]).success).toBe(false);
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
