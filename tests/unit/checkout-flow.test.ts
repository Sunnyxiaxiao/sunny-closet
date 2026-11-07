import { beforeEach, describe, expect, it } from "vitest";
import {
  CheckoutError,
  completeCheckout,
  expireCheckout,
  openCheckout,
  settleWaitingOrder,
  sweepWaitingOrders,
  type CheckoutDeps,
  type PaymentStore,
  type WaitingOrder,
} from "@/lib/payments/checkout";

/**
 * 付款流程（src/lib/payments/checkout.ts）用假的 Stripe 和假的数据库测：
 * 假 Stripe 按真实规则处理防重复键（同键同请求返回第一次的结果、同键不同请求报错、参数校验失败不记结果）；
 * 假数据库按迁移里 claim_checkout_attempt 和各个带条件的 update 的规则改订单。
 */

const MIN = 60_000;
let clock: number;
const now = () => new Date(clock);

// ---------------------------------------------------------------------------
// 假 Stripe
// ---------------------------------------------------------------------------
type Session = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  url: string | null;
  mode: "payment" | "setup";
  customer: string;
  metadata: Record<string, string>;
  expires_at: number;
  payment_status: "paid" | "unpaid";
  amount_total: number;
  payment_intent: unknown;
  setup_intent: unknown;
};

class FakeStripe {
  sessions = new Map<string, Session>();
  customersCreated = 0;
  sessionsCreated = 0;
  private idem = new Map<string, { body: string; result: unknown }>();
  private seq = 0;
  /** Next calls to sessions.create fail like a dropped connection: "before" never reaches Stripe, "after" is processed but the answer is lost */
  dropNext: "before" | "after" | null = null;

  private idempotent<T>(key: string, params: unknown, run: () => T): T {
    const body = JSON.stringify(params);
    const seen = this.idem.get(key);
    if (seen) {
      if (seen.body !== body) throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), { type: "StripeIdempotencyError" });
      return seen.result as T;
    }
    const result = run();
    this.idem.set(key, { body, result });
    return result;
  }

  customers = {
    create: async (params: unknown, options: { idempotencyKey: string }) =>
      this.idempotent(options.idempotencyKey, params, () => {
        this.customersCreated += 1;
        return { id: `cus_${++this.seq}` };
      }),
  };

  checkout = {
    sessions: {
      create: async (params: Record<string, unknown>, options: { idempotencyKey: string }) => {
        if (this.dropNext === "before") {
          this.dropNext = null;
          throw Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" });
        }
        const seen = this.idem.has(options.idempotencyKey);
        // Stripe needs a page to stay open at least 30 minutes; a refused request isn't remembered under its key
        if (!seen && (params.expires_at as number) < Math.floor(clock / 1000) + 30 * 60 - 60) {
          throw Object.assign(new Error("expires_at must be at least 30 minutes from now"), {
            type: "StripeInvalidRequestError",
            param: "expires_at",
          });
        }
        const session = this.idempotent(options.idempotencyKey, params, () => {
          this.sessionsCreated += 1;
          const id = `cs_${++this.seq}`;
          const s: Session = {
            id,
            object: "checkout.session",
            status: "open",
            url: `https://checkout.stripe.test/${id}`,
            mode: params.mode as "payment" | "setup",
            customer: params.customer as string,
            metadata: params.metadata as Record<string, string>,
            expires_at: params.expires_at as number,
            payment_status: "unpaid",
            amount_total: 4900,
            payment_intent: null,
            setup_intent: null,
          };
          this.sessions.set(id, s);
          return s;
        });
        if (this.dropNext === "after") {
          this.dropNext = null;
          throw Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" });
        }
        return session;
      },
      retrieve: async (id: string) => {
        const s = this.sessions.get(id);
        if (!s) throw Object.assign(new Error("No such session"), { type: "StripeInvalidRequestError" });
        if (s.status === "open" && s.expires_at * 1000 <= clock) s.status = "expired";
        return { ...s, url: s.status === "open" ? s.url : null };
      },
      list: async ({ customer }: { customer: string }) => ({
        data: [...this.sessions.values()].filter((s) => s.customer === customer).reverse(),
      }),
      expire: async (id: string) => {
        const s = this.sessions.get(id)!;
        s.status = "expired";
        return s;
      },
    },
  };

  /** The customer pays on the page */
  pay(sessionId: string) {
    const s = this.sessions.get(sessionId)!;
    s.status = "complete";
    s.payment_status = "paid";
    s.payment_intent = {
      id: `pi_${sessionId}`,
      payment_method: { id: `pm_${sessionId}`, card: { brand: "visa", last4: "4242" } },
    };
  }

  /** Time passes at Stripe: open pages past their expiry expire */
  expireDue() {
    for (const s of this.sessions.values()) if (s.status === "open" && s.expires_at * 1000 <= clock) s.status = "expired";
  }
}

// ---------------------------------------------------------------------------
// 假数据库（规则同迁移 20261102000026 与 src/lib/stripe.ts 里的查询）
// ---------------------------------------------------------------------------
interface Order {
  id: string;
  bookingNo: string;
  status: "pending" | "confirmed" | "cancelled";
  paymentMethod: "card" | "in_person_card" | "in_person";
  createdAt: number;
  attemptKey: string | null;
  attemptExpiresAt: number | null;
  sessionId: string | null;
  customerId: string | null;
  paidAt: string | null;
  paymentIntentId: string | null;
  refundStatus: "due" | "refunded" | null;
  refundCents: number | null;
  /** Short-notice shipping without rush: paying doesn't confirm it */
  awaitingAcceptance: boolean;
}

class FakeStore implements PaymentStore {
  orders = new Map<string, Order>();
  private keys = 0;
  failSaveSession = false;

  add(id: string, extra: Partial<Order> = {}): Order {
    const order: Order = {
      id,
      bookingNo: `SC-${id}`,
      status: "pending",
      paymentMethod: "card",
      createdAt: clock,
      attemptKey: null,
      attemptExpiresAt: null,
      sessionId: null,
      customerId: null,
      paidAt: null,
      paymentIntentId: null,
      refundStatus: null,
      refundCents: null,
      awaitingAcceptance: false,
      ...extra,
    };
    this.orders.set(id, order);
    return order;
  }

  async payableOrder(bookingNo: string) {
    const o = [...this.orders.values()].find((x) => x.bookingNo === bookingNo);
    if (!o || o.status !== "pending" || o.paidAt || o.paymentMethod === "in_person") return null;
    return { id: o.id, bookingNo: o.bookingNo, customerName: "Ann", customerEmail: "a@b.co", saveCardOnly: o.paymentMethod === "in_person_card" };
  }
  async claimAttempt(bookingId: string, replaceKey?: string) {
    const o = this.orders.get(bookingId);
    if (!o || o.status !== "pending" || o.paidAt || o.paymentMethod === "in_person") throw new CheckoutError("order_not_payable");
    let created = false;
    if (o.attemptKey === null || o.attemptKey === replaceKey) {
      o.attemptKey = `key-${++this.keys}`;
      o.attemptExpiresAt = clock + 32 * MIN;
      o.sessionId = null;
      created = true;
    }
    return { key: o.attemptKey, expiresAt: new Date(o.attemptExpiresAt!), sessionId: o.sessionId, customerId: o.customerId, created };
  }
  async saveCustomer(bookingId: string, customerId: string) {
    const o = this.orders.get(bookingId)!;
    o.customerId ??= customerId;
  }
  async saveSession(bookingId: string, attemptKey: string, sessionId: string) {
    if (this.failSaveSession) throw new Error("保存付款页面失败：connection lost");
    const o = this.orders.get(bookingId)!;
    if (o.attemptKey !== attemptKey) return false;
    o.sessionId = sessionId;
    return true;
  }
  async confirmPaid(bookingId: string, details: { stripe_payment_intent_id?: string; paid_at?: string }) {
    const o = this.orders.get(bookingId)!;
    if (o.status !== "pending" || o.paidAt) return false as const;
    o.paymentIntentId = details.stripe_payment_intent_id ?? null;
    o.paidAt = details.paid_at ?? null;
    if (o.awaitingAcceptance) return "awaiting" as const;
    o.status = "confirmed";
    return "confirmed" as const;
  }
  async recordLatePayment(bookingId: string, details: { stripe_payment_intent_id: string; paid_cents: number; paid_at: string }) {
    const o = this.orders.get(bookingId)!;
    if (o.paymentIntentId === details.stripe_payment_intent_id) return "recorded" as const;
    if (!o.paidAt) {
      Object.assign(o, { paymentIntentId: details.stripe_payment_intent_id, paidAt: details.paid_at, refundStatus: "due", refundCents: details.paid_cents });
      return "cancelled" as const;
    }
    if (o.refundStatus === null) {
      Object.assign(o, { refundStatus: "due", refundCents: details.paid_cents });
      return "second_payment" as const;
    }
    return "already_due" as const;
  }
  async cancelAttempt(bookingId: string, attemptKey: string | null) {
    const o = this.orders.get(bookingId)!;
    if (o.status !== "pending" || o.paidAt || o.attemptKey !== attemptKey) return false;
    o.status = "cancelled";
    return true;
  }
  async cancelBySession(sessionId: string) {
    const o = [...this.orders.values()].find((x) => x.sessionId === sessionId && x.status === "pending" && !x.paidAt);
    if (!o) return false;
    o.status = "cancelled";
    return true;
  }
  async waitingOrders(): Promise<WaitingOrder[]> {
    return [...this.orders.values()]
      .filter((o) => o.status === "pending" && !o.paidAt && o.paymentMethod !== "in_person")
      .map((o) => ({
        id: o.id,
        createdAt: new Date(o.createdAt),
        attemptKey: o.attemptKey,
        attemptExpiresAt: o.attemptExpiresAt === null ? null : new Date(o.attemptExpiresAt),
        sessionId: o.sessionId,
        customerId: o.customerId,
      }));
  }
}

let stripe: FakeStripe;
let store: FakeStore;
let confirmed: string[];
let awaiting: string[];
let refunds: { bookingId: string; cents: number; reason: string }[];
let deps: CheckoutDeps;

beforeEach(() => {
  clock = Date.parse("2026-12-01T12:00:00Z");
  stripe = new FakeStripe();
  store = new FakeStore();
  confirmed = [];
  awaiting = [];
  refunds = [];
  deps = {
    stripe: stripe as unknown as CheckoutDeps["stripe"],
    store,
    now,
    pageParams: async () => ({
      lineItems: [{ name: "Suit", cents: 4900 }],
      submitMessage: "",
      successUrl: "https://site.test/return",
      cancelUrl: "https://site.test/booking",
      paymentDescription: "",
      setupDescription: "",
    }),
    onConfirmed: (id) => confirmed.push(id),
    onAwaitingAcceptance: (id) => awaiting.push(id),
    onRefundDue: (bookingId, cents, reason) => refunds.push({ bookingId, cents, reason }),
  };
});

const session = (url: string) => stripe.sessions.get(url.split("/").pop()!)!;

describe("打开付款页", () => {
  it("同一订单同时打开两次：Stripe 只建一个页面，两边拿到同一个地址", async () => {
    store.add("o1");
    const [a, b] = await Promise.all([openCheckout(deps, "SC-o1", "en"), openCheckout(deps, "SC-o1", "en")]);
    expect(a).toBe(b);
    expect(stripe.sessionsCreated).toBe(1);
    expect(stripe.customersCreated).toBe(1);
    expect(store.orders.get("o1")!.sessionId).toBe(session(a).id);
  });

  it("页面还开着时再点“付款”：回到原来那个页面，不新建", async () => {
    store.add("o1");
    const first = await openCheckout(deps, "SC-o1", "en");
    clock += 10 * MIN;
    expect(await openCheckout(deps, "SC-o1", "en")).toBe(first);
    expect(stripe.sessionsCreated).toBe(1);
  });

  it("页面过期后再点：换新的尝试、新的页面；旧页面的过期通知不会取消订单", async () => {
    store.add("o1");
    const first = await openCheckout(deps, "SC-o1", "en");
    clock += 33 * MIN;
    const second = await openCheckout(deps, "SC-o1", "en");
    expect(second).not.toBe(first);
    expect(stripe.sessionsCreated).toBe(2);

    await expireCheckout(deps, session(first) as never);
    expect(store.orders.get("o1")!.status).toBe("pending");
  });

  it("两个语言同时打开同一订单：后到的那个提示稍后重试，不会出现第二个页面", async () => {
    store.add("o1");
    const results = await Promise.allSettled([openCheckout(deps, "SC-o1", "en"), openCheckout(deps, "SC-o1", "zh")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "busy" });
    expect(stripe.sessionsCreated).toBe(1);
  });

  it("已付款、已取消、当面付款的订单打不开付款页", async () => {
    store.add("paid", { status: "confirmed", paidAt: "x" });
    store.add("cancelled", { status: "cancelled" });
    store.add("cash", { paymentMethod: "in_person" });
    for (const no of ["SC-paid", "SC-cancelled", "SC-cash", "SC-missing"]) {
      await expect(openCheckout(deps, no, "en")).rejects.toMatchObject({ code: "order_not_payable" });
    }
    expect(stripe.sessionsCreated).toBe(0);
  });

  it("页面已经付完（回调还没到）：不再新建，顺手确认订单", async () => {
    store.add("o1");
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await expect(openCheckout(deps, "SC-o1", "en")).rejects.toMatchObject({ code: "order_not_payable" });
    expect(store.orders.get("o1")!.status).toBe("confirmed");
    expect(stripe.sessionsCreated).toBe(1);
  });
});

describe("结果未知：不释放库存，用原来的编号找回", () => {
  it("Stripe 建好了页面但数据库没存上：订单仍在；再打开时拿回同一个页面", async () => {
    store.add("o1");
    store.failSaveSession = true;
    await expect(openCheckout(deps, "SC-o1", "en")).rejects.toThrow(/保存付款页面失败/);
    expect(store.orders.get("o1")!.status).toBe("pending");
    expect(store.orders.get("o1")!.sessionId).toBeNull();

    store.failSaveSession = false;
    clock += 5 * MIN;
    const url = await openCheckout(deps, "SC-o1", "en");
    expect(stripe.sessionsCreated).toBe(1);
    expect(store.orders.get("o1")!.sessionId).toBe(session(url).id);
  });

  it("没存上的页面被付了款：定期清理按顾客找到它，确认订单而不是取消", async () => {
    store.add("o1");
    store.failSaveSession = true;
    await openCheckout(deps, "SC-o1", "en").catch(() => undefined);
    const [paidPage] = stripe.sessions.values();
    stripe.pay(paidPage.id);

    clock += 40 * MIN;
    expect(await sweepWaitingOrders(deps)).toEqual({ confirmed: 1 });
    expect(store.orders.get("o1")!.status).toBe("confirmed");
    expect(confirmed).toEqual(["o1"]);
  });

  it("没存上的页面过期了：定期清理才取消，释放库存", async () => {
    store.add("o1");
    store.failSaveSession = true;
    await openCheckout(deps, "SC-o1", "en").catch(() => undefined);
    clock += 20 * MIN;
    expect(await sweepWaitingOrders(deps)).toEqual({ not_due: 1 });

    clock += 20 * MIN;
    stripe.expireDue();
    expect(await sweepWaitingOrders(deps)).toEqual({ cancelled: 1 });
    expect(store.orders.get("o1")!.status).toBe("cancelled");
  });

  it("请求没到 Stripe 就断了：订单不取消；几分钟后重试会换新尝试（Stripe 证明之前没建成）", async () => {
    store.add("o1");
    stripe.dropNext = "before";
    await expect(openCheckout(deps, "SC-o1", "en")).rejects.toThrow(/Connection reset/);
    expect(store.orders.get("o1")!.status).toBe("pending");

    clock += 5 * MIN;
    const url = await openCheckout(deps, "SC-o1", "en");
    expect(stripe.sessionsCreated).toBe(1);
    expect(store.orders.get("o1")!.attemptKey).toBe("key-2");
    expect(session(url).metadata.attempt_key).toBe("key-2");
  });

  it("请求到了 Stripe、只是回复丢了：重试拿回同一个页面，不会有第二个", async () => {
    store.add("o1");
    stripe.dropNext = "after";
    await expect(openCheckout(deps, "SC-o1", "en")).rejects.toThrow(/Connection reset/);
    clock += 1 * MIN;
    await openCheckout(deps, "SC-o1", "en");
    expect(stripe.sessionsCreated).toBe(1);
  });
});

describe("付款结果与通知顺序", () => {
  it("回调和顾客跳回同时报告付款：只确认一次、只发一次邮件", async () => {
    store.add("o1");
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await Promise.all([completeCheckout(deps, session(url).id), completeCheckout(deps, session(url).id)]);
    expect(store.orders.get("o1")!.status).toBe("confirmed");
    expect(confirmed).toEqual(["o1"]);
    expect(refunds).toEqual([]);
  });

  it("先收到“已完成”、后收到同一页面的“过期”（乱序）：订单保持已确认", async () => {
    store.add("o1");
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await completeCheckout(deps, session(url).id);
    await expireCheckout(deps, session(url) as never);
    expect(store.orders.get("o1")!.status).toBe("confirmed");
  });

  it("订单已取消后才付款成功：记下付款、标为待退款、提醒店主（重复通知只提醒一次）", async () => {
    store.add("o1");
    const url = await openCheckout(deps, "SC-o1", "en");
    store.orders.get("o1")!.status = "cancelled"; // e.g. the admin cancelled it while the customer was paying
    stripe.pay(session(url).id);
    await completeCheckout(deps, session(url).id);
    await completeCheckout(deps, session(url).id);
    expect(store.orders.get("o1")).toMatchObject({ status: "cancelled", refundStatus: "due", refundCents: 4900, paymentIntentId: `pi_${session(url).id}` });
    expect(refunds).toEqual([{ bookingId: "o1", cents: 4900, reason: "cancelled" }]);
  });

  it("已付款的订单又收到一笔：标为待退款并提醒，不改动原来的付款", async () => {
    store.add("o1");
    const first = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(first).id);
    await completeCheckout(deps, session(first).id);
    // A page from before this fix (no attempt key) was still open and got paid too
    const old = await stripe.checkout.sessions.create(
      { mode: "payment", customer: "cus_x", metadata: { booking_id: "o1", booking_no: "SC-o1", locale: "en" }, expires_at: Math.floor(clock / 1000) + 3600 },
      { idempotencyKey: "legacy" },
    );
    stripe.pay(old.id);
    await completeCheckout(deps, old.id);
    await completeCheckout(deps, old.id);
    expect(store.orders.get("o1")).toMatchObject({ status: "confirmed", paymentIntentId: `pi_${session(first).id}`, refundStatus: "due" });
    expect(refunds).toEqual([{ bookingId: "o1", cents: 4900, reason: "second_payment" }]);
  });

  it("取消和付款同时发生：要么已确认，要么已取消且待退款，不会已收款却悄悄放掉库存", async () => {
    store.add("o1");
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await Promise.all([store.cancelAttempt("o1", "key-1"), completeCheckout(deps, session(url).id)]);
    const o = store.orders.get("o1")!;
    expect(o.status === "confirmed" || (o.status === "cancelled" && o.refundStatus === "due")).toBe(true);
  });
});

describe("定期清理", () => {
  it("从没领到付款尝试的订单：给满付款时间后才取消", async () => {
    store.add("o1");
    clock += 20 * MIN;
    expect(await sweepWaitingOrders(deps)).toEqual({ not_due: 1 });
    clock += 20 * MIN;
    expect(await sweepWaitingOrders(deps)).toEqual({ cancelled: 1 });
  });

  it("付款页还开着：不动", async () => {
    store.add("o1");
    await openCheckout(deps, "SC-o1", "en");
    clock += 10 * MIN;
    expect(await settleWaitingOrder(deps, (await store.waitingOrders())[0])).toBe("not_due");
    expect(store.orders.get("o1")!.status).toBe("pending");
  });

  it("页面过期：取消；已付款的订单和当面付款的订单不在清理范围", async () => {
    store.add("o1");
    store.add("paid", { status: "confirmed", paidAt: "x" });
    store.add("cash", { paymentMethod: "in_person", status: "confirmed" });
    await openCheckout(deps, "SC-o1", "en");
    clock += 40 * MIN;
    stripe.expireDue();
    expect(await sweepWaitingOrders(deps)).toEqual({ cancelled: 1 });
    expect(store.orders.get("paid")!.status).toBe("confirmed");
    expect(store.orders.get("cash")!.status).toBe("confirmed");
  });

  it("Stripe 连不上：这一单留着下次再看，不取消", async () => {
    store.add("o1");
    await openCheckout(deps, "SC-o1", "en");
    clock += 40 * MIN;
    stripe.checkout.sessions.retrieve = async () => {
      throw Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" });
    };
    expect(await sweepWaitingOrders(deps)).toEqual({ error: 1 });
    expect(store.orders.get("o1")!.status).toBe("pending");
  });
});

describe("邮寄急单（不加急）：付款不等于接单", () => {
  it("付款后仍是待处理，等店主确认；不发“已确认”邮件", async () => {
    store.add("o1", { awaitingAcceptance: true });
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await completeCheckout(deps, session(url).id);
    expect(store.orders.get("o1")).toMatchObject({ status: "pending", paidAt: expect.any(String) });
    expect(confirmed).toEqual([]);
    expect(awaiting).toEqual(["o1"]);
  });

  it("付款通知重复到达：只记一次，不算重复付款", async () => {
    store.add("o1", { awaitingAcceptance: true });
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await completeCheckout(deps, session(url).id);
    await completeCheckout(deps, session(url).id);
    expect(awaiting).toEqual(["o1"]);
    expect(refunds).toEqual([]);
  });

  it("已付款、等确认的订单：定期清理不会取消它，也不能再开付款页", async () => {
    store.add("o1", { awaitingAcceptance: true });
    const url = await openCheckout(deps, "SC-o1", "en");
    stripe.pay(session(url).id);
    await completeCheckout(deps, session(url).id);
    clock += 3 * 60 * MIN;
    stripe.expireDue();
    expect(await sweepWaitingOrders(deps)).toEqual({});
    expect(store.orders.get("o1")!.status).toBe("pending");
    await expect(openCheckout(deps, "SC-o1", "en")).rejects.toThrow(/order_not_payable/);
  });

  it("还没付款的急单：和普通订单一样，付款页过期就取消", async () => {
    store.add("o1", { awaitingAcceptance: true });
    await openCheckout(deps, "SC-o1", "en");
    clock += 40 * MIN;
    stripe.expireDue();
    expect(await sweepWaitingOrders(deps)).toEqual({ cancelled: 1 });
  });
});
