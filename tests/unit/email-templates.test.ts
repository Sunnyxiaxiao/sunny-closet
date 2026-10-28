import { describe, expect, it } from "vitest";
import { shop } from "@/config/shop";
import { newOrderEmail, orderConfirmedEmail, type OrderEmailData } from "@/lib/email/templates";

const order: OrderEmailData = {
  bookingNo: "SC-ABCD2345",
  customerName: "Amy <script>",
  customerEmail: "amy@example.com",
  customerPhone: "5551234567",
  customerNote: "微信号：amy123",
  fulfillment: "shipping",
  shippingAddress: "1 Main St, Ithaca, NY 14850",
  lines: [
    {
      name: "ISEE MIGGA 暗夜紫十字滑雪套装",
      nameEn: "ISEE MIGGA Dark Night Purple Cross Ski Suit",
      size: "M",
      start: "2027-01-20",
      end: "2027-01-21",
      rentalDays: 2,
      rentalCents: 7900,
      depositCents: 20000,
      leadDays: 3,
      tailDays: 4,
    },
    {
      name: "ISEE MIGGA 十字满钻滑雪手套",
      nameEn: "ISEE MIGGA Cross Rhinestone Gloves",
      size: "湖水蓝 · M",
      start: "2027-01-20",
      end: "2027-01-21",
      rentalDays: 2,
      rentalCents: 2200,
      depositCents: 0,
      leadDays: 3,
      tailDays: 4,
    },
  ],
  addOns: [{ name: "黑猫头盔套", nameEn: "Black Cat Helmet Cover", cents: 800 }],
  shippingCents: 0,
  totalCents: 7900 + 20000 + 2200 + 800,
};

describe("新订单通知（发给店主）", () => {
  const email = newOrderEmail(order, { to: "shop@example.com", origin: "https://sunny.example" });

  it("发给店主，回复直接回给顾客；标题有编号、顾客、件数", () => {
    expect(email.to).toBe("shop@example.com");
    expect(email.replyTo).toBe("amy@example.com");
    expect(email.subject).toBe("New booking SC-ABCD2345 · Amy <script> · 2 items");
  });

  it("列出每件（中文名）、加购、邮寄地址、联系方式、合计和后台链接", () => {
    for (const text of [
      "Item 1: ISEE MIGGA 暗夜紫十字滑雪套装",
      "Size 湖水蓝 · M",
      "Add-on: 黑猫头盔套 · $8.00",
      "Ship to: 1 Main St, Ithaca, NY 14850",
      "Phone: 5551234567",
      "Note: 微信号：amy123",
      "Total: $309.00 (incl. $200.00 deposit)",
      "https://sunny.example/admin?status=pending",
    ]) {
      expect(email.text).toContain(text);
    }
  });

  it("HTML 里顾客填的内容会转义", () => {
    expect(email.html).toContain("Amy &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });
});

describe("订单确认邮件（发给顾客）", () => {
  const email = orderConfirmedEmail(order, { origin: "https://sunny.example" });

  it("发给顾客，英文商品名、应付金额、押金说明、付款方式", () => {
    expect(email.to).toBe("amy@example.com");
    expect(email.subject).toBe(`Your ${shop.name} booking SC-ABCD2345 is confirmed`);
    for (const text of [
      "ISEE MIGGA Dark Night Purple Cross Ski Suit",
      "Size Greek Blue · M",
      "Black Cat Helmet Cover",
      "Method: Shipping (free)",
      "Amount due: $309.00",
      "Includes a $200.00 deposit",
      `Zelle: ${shop.payment.zelle}`,
      `Venmo: ${shop.payment.venmo}`,
      "include your booking number SC-ABCD2345",
      "https://sunny.example/en/booking/SC-ABCD2345",
    ]) {
      expect(email.text).toContain(text);
    }
    expect(email.text).not.toContain("暗夜紫");
  });

  it("每件日期不同时分别写取件 / 归还时间", () => {
    const pickup = orderConfirmedEmail(
      {
        ...order,
        fulfillment: "pickup",
        shippingAddress: null,
        lines: [order.lines[0], { ...order.lines[1], start: "2027-02-10", end: "2027-02-10", rentalDays: 1, leadDays: 1, tailDays: 1 }],
      },
      { origin: "https://sunny.example" },
    );
    expect(pickup.text).toContain("Method: In-store pickup");
    expect(pickup.text).toMatch(/Item 1: .*Jan/);
    expect(pickup.text).toMatch(/Item 2: .*Feb/);
    expect(pickup.text).not.toContain("Ship to");
  });
});
