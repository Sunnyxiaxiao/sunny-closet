import { describe, expect, it } from "vitest";
import { shop } from "@/config/shop";
import {
  awaitingAcceptanceEmail,
  newOrderEmail,
  orderConfirmedEmail,
  orderDeclinedEmail,
  type OrderEmailData,
} from "@/lib/email/templates";

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
  rushFeeCents: 0,
  acceptance: null,
  totalCents: 7900 + 20000 + 2200 + 800,
  payment: { method: null, paidCents: null, card: null, cashDepositCents: 0 },
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
      "https://sunny.example/booking/SC-ABCD2345",
      "sign in with amy@example.com",
    ]) {
      expect(email.text).toContain(text);
    }
    expect(email.text).not.toContain("暗夜紫");
  });

  const noDeposit = { ...order, lines: order.lines.map((l) => ({ ...l, depositCents: 0 })), totalCents: 10900 };

  it("刷卡付过款：写已付金额和卡，不写 Zelle", () => {
    const paid = orderConfirmedEmail(
      { ...noDeposit, payment: { method: "card", paidCents: 10900, card: "Visa •••• 4242", cashDepositCents: 0 } },
      { origin: "https://sunny.example" },
    );
    expect(paid.text).toContain("Paid: $109.00 · Visa •••• 4242");
    expect(paid.text).toContain("No deposit needed");
    expect(paid.text).not.toContain("Zelle:");
    expect(paid.text).not.toContain("deposit, refunded");
  });

  it("当面付租金 + 在线留卡：写取件时付款和留卡，不收押金", () => {
    const email = orderConfirmedEmail(
      { ...noDeposit, payment: { method: "in_person_card", paidCents: null, card: "Visa •••• 4242", cashDepositCents: 0 } },
      { origin: "https://sunny.example" },
    );
    expect(email.text).toContain("Due at pickup: $109.00");
    expect(email.text).toContain("Your card (Visa •••• 4242) is kept on file");
    expect(email.text).not.toContain("Deposit:");
  });

  it("当面付租金 + 押金：写取件时付款和押金", () => {
    const email = orderConfirmedEmail(
      { ...noDeposit, payment: { method: "in_person", paidCents: null, card: null, cashDepositCents: 20000 } },
      { origin: "https://sunny.example" },
    );
    expect(email.text).toContain("Due at pickup: $109.00");
    expect(email.text).toContain("Deposit: $200.00, paid at pickup and returned in person");
    expect(email.text).not.toContain(`Zelle: ${shop.payment.zelle}`);
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

describe("邮寄急单", () => {
  const paid = { ...order, payment: { method: "card" as const, paidCents: 10900, card: "Visa •••• 4242", cashDepositCents: 0 } };

  it("加急：邮寄方式写明加急和加急费", () => {
    const email = orderConfirmedEmail({ ...paid, shippingCents: 1500, rushFeeCents: 1500 }, { origin: "https://x.test" });
    expect(email.text).toContain("Rush shipping, USPS Priority Mail ($15.00, incl. $15.00 rush fee)");
  });

  it("等店主确认：店主收到的新订单写明还没确认，标题提示接单或拒单", () => {
    const email = newOrderEmail({ ...paid, acceptance: "awaiting" }, { to: "owner@x.test", origin: "https://x.test" });
    expect(email.subject).toMatch(/^Accept or decline: New booking SC-ABCD2345/);
    expect(email.text).toContain("NOT confirmed yet");
    expect(email.text).toContain("https://x.test/admin?status=pending");
  });

  it("等店主确认：顾客收到“已付款，正在确认”，写明 24 小时和全额退款", () => {
    const email = awaitingAcceptanceEmail({ ...paid, acceptance: "awaiting" }, { origin: "https://x.test" });
    expect(email.to).toBe("amy@example.com");
    expect(email.text).toContain("within 24 hours");
    expect(email.text).toContain("refund you in full");
    expect(email.text).toContain("$109.00");
    expect(email.text).not.toContain("is confirmed");
  });

  it("拒单：顾客收到取消和全额退款金额", () => {
    const email = orderDeclinedEmail(paid, { origin: "https://x.test", refundCents: 10900 });
    expect(email.subject).toBe("Booking SC-ABCD2345 cancelled: full refund");
    expect(email.text).toContain("full refund of $109.00");
  });

  it("后台取消：已退款写明金额，待处理的写会联系，没付款的不提退款", async () => {
    const { orderCancelledEmail } = await import("@/lib/email/templates");
    const refunded = orderCancelledEmail(paid, { origin: "https://x.test", refundCents: 10900, refunded: true });
    expect(refunded.to).toBe("amy@example.com");
    expect(refunded.subject).toBe("Booking SC-ABCD2345 cancelled: $109.00 refunded");
    expect(refunded.text).toContain("We've refunded $109.00 to your card");

    const later = orderCancelledEmail(paid, { origin: "https://x.test", refundCents: 10900, refunded: false });
    expect(later.subject).toBe("Booking SC-ABCD2345 cancelled");
    expect(later.text).toContain("We'll be in touch about your refund");

    const unpaid = orderCancelledEmail(order, { origin: "https://x.test", refundCents: 0, refunded: false });
    expect(unpaid.text).toContain("has been cancelled.");
    expect(unpaid.text).not.toContain("refund");
  });
});

describe("提醒邮件", () => {
  it("取件提醒：给顾客，写明取件时间；当面付的订单带应付金额", async () => {
    const { pickupReminderEmail } = await import("@/lib/email/templates");
    const pickup: OrderEmailData = {
      ...order,
      fulfillment: "pickup",
      shippingAddress: null,
      shippingCents: 0,
      rushFeeCents: 0,
      lines: order.lines.map((l) => ({ ...l, leadDays: 1, tailDays: 1 })),
      payment: { method: "in_person_card", paidCents: null, card: "Visa •••• 4242", cashDepositCents: 0 },
    };
    const email = pickupReminderEmail(pickup, { origin: "https://example.com" });
    expect(email.to).toBe("amy@example.com");
    expect(email.subject).toContain("Pickup reminder");
    expect(email.text).toContain("pick up from the evening of Jan 19");
    expect(email.text).toContain("Due at pickup");
    expect(email.text).toContain("https://example.com/booking/SC-ABCD2345");
    expect(email.html).not.toContain("<script>");
  });

  it("归还提醒：邮寄写 USPS 和寄回日期，自取写归还时间，都提醒不用自己洗", async () => {
    const { returnReminderEmail } = await import("@/lib/email/templates");
    const shipped = returnReminderEmail(order, { origin: "https://example.com" });
    expect(shipped.subject).toContain("Return reminder");
    expect(shipped.text).toContain("prepaid return label");
    expect(shipped.text).toContain("send back by Jan 22");
    expect(shipped.text).not.toContain("Ship to");
    expect(shipped.text).toContain("No need to wash");

    const local = returnReminderEmail(
      { ...order, fulfillment: "pickup", shippingAddress: null, lines: order.lines.map((l) => ({ ...l, leadDays: 1, tailDays: 1 })) },
      { origin: "https://example.com" },
    );
    expect(local.text).toContain("return by noon on Jan 22");
    expect(local.text).not.toContain("USPS");
  });
});
