import { beforeEach, describe, expect, it } from "vitest";
import { chargeCard, retryCharge, type ChargeDeps, type ChargeRow, type ChargeStore } from "@/lib/payments/card-charge";
import type { CardChargeStatus } from "@/lib/supabase/database.types";

/**
 * 后台从留存的卡里扣款（src/lib/payments/card-charge.ts）：假的 Stripe 按防重复键规则处理，
 * 假的数据库按迁移里的唯一约束（同一个键只能一条、一单只能有一笔未确定的扣款）。
 */

const HOUR = 3_600_000;
let clock: number;
const target = { bookingId: "b1", bookingNo: "SC-1", customerId: "cus_1", paymentMethodId: "pm_1" };

class FakeStripe {
  charged = 0;
  private idem = new Map<string, unknown>();
  intents: { id: string; status: string; metadata: Record<string, string> }[] = [];
  /** How the next create call fails: "before" = never reached Stripe, "after" = charged but the answer was lost, "decline" = card declined */
  next: "before" | "after" | "decline" | "requires_action" | null = null;

  paymentIntents = {
    create: async (params: { metadata: Record<string, string> }, options: { idempotencyKey: string }) => {
      const mode = this.next;
      this.next = null;
      if (mode === "before") throw Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" });
      if (mode === "decline") throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", payment_intent: { id: "pi_declined" } });
      let intent = this.idem.get(options.idempotencyKey) as (typeof this.intents)[number] | undefined;
      if (!intent) {
        intent = { id: `pi_${this.intents.length + 1}`, status: mode === "requires_action" ? "requires_action" : "succeeded", metadata: params.metadata };
        if (intent.status === "succeeded") this.charged += 1;
        this.intents.push(intent);
        this.idem.set(options.idempotencyKey, intent);
      }
      if (mode === "after") throw Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" });
      return intent;
    },
    search: async ({ query }: { query: string }) => ({
      data: this.intents.filter((i) => query.includes(`'${i.metadata.charge_id}'`)),
    }),
  };

  /** Stripe forgets idempotency keys after 24 hours */
  forgetKeys() {
    this.idem.clear();
  }
}

class FakeStore implements ChargeStore {
  rows: (ChargeRow & { intentId: string | null; failure: string | null })[] = [];
  async insertPending(t: typeof target, amountCents: number, reason: string, key: string) {
    if (this.rows.some((r) => r.idempotencyKey === key)) return "duplicate" as const;
    if (this.rows.some((r) => r.bookingId === t.bookingId && (r.status === "pending" || r.status === "unknown"))) return "busy" as const;
    const row = {
      id: `ch-${this.rows.length + 1}`,
      bookingId: t.bookingId,
      amountCents,
      reason,
      status: "pending" as CardChargeStatus,
      idempotencyKey: key,
      createdAt: new Date(clock),
      updatedAt: new Date(clock),
      intentId: null,
      failure: null,
    };
    this.rows.push(row);
    return { ...row };
  }
  async setResult(id: string, result: { status: CardChargeStatus; intentId?: string | null; failure?: string | null }) {
    const row = this.rows.find((r) => r.id === id)!;
    row.status = result.status;
    if (result.intentId !== undefined) row.intentId = result.intentId;
    if (result.failure !== undefined) row.failure = result.failure;
    row.updatedAt = new Date(clock);
  }
  row(id: string) {
    return { ...this.rows.find((r) => r.id === id)! };
  }
}

let stripe: FakeStripe;
let store: FakeStore;
let deps: ChargeDeps;

beforeEach(() => {
  clock = Date.parse("2026-12-01T12:00:00Z");
  stripe = new FakeStripe();
  store = new FakeStore();
  deps = { stripe: stripe as unknown as ChargeDeps["stripe"], store, now: () => new Date(clock) };
});

describe("从留存的卡里扣款", () => {
  it("成功：记为已扣款，带上 Stripe 的扣款编号", async () => {
    const outcome = await chargeCard(deps, target, 2500, "逾期 1 天", "k1");
    expect(outcome.status).toBe("succeeded");
    expect(store.rows[0]).toMatchObject({ status: "succeeded", intentId: "pi_1" });
    expect(stripe.charged).toBe(1);
  });

  it("同一个表单提交两次：只有一笔", async () => {
    await chargeCard(deps, target, 2500, "逾期 1 天", "k1");
    const again = await chargeCard(deps, target, 2500, "逾期 1 天", "k1");
    expect(again.status).toBe("duplicate");
    expect(stripe.charged).toBe(1);
    expect(store.rows).toHaveLength(1);
  });

  it("卡被拒：明确失败，可以重新发起新的一笔", async () => {
    stripe.next = "decline";
    const outcome = await chargeCard(deps, target, 2500, "逾期 1 天", "k1");
    expect(outcome).toMatchObject({ status: "failed" });
    expect(store.rows[0]).toMatchObject({ status: "failed", intentId: "pi_declined" });
    expect((await chargeCard(deps, target, 2500, "逾期 1 天", "k2")).status).toBe("succeeded");
  });

  it("银行要求顾客验证：记为失败（没扣到）", async () => {
    stripe.next = "requires_action";
    expect((await chargeCard(deps, target, 2500, "逾期", "k1")).status).toBe("failed");
    expect(stripe.charged).toBe(0);
  });
});

describe("结果未知", () => {
  it("连接断开（其实扣到了）：记为结果未知，不算失败；重试同一笔拿回原结果，不会扣第二次", async () => {
    stripe.next = "after";
    const first = await chargeCard(deps, target, 2500, "外套丢失", "k1");
    expect(first.status).toBe("unknown");
    expect(store.rows[0].status).toBe("unknown");
    expect(stripe.charged).toBe(1);

    const retried = await retryCharge(deps, target, store.row("ch-1"));
    expect(retried.status).toBe("succeeded");
    expect(stripe.charged).toBe(1);
    expect(store.rows[0]).toMatchObject({ status: "succeeded", intentId: "pi_1" });
  });

  it("连接断开（没到 Stripe）：重试同一笔才真正扣款，仍然只有一笔", async () => {
    stripe.next = "before";
    await chargeCard(deps, target, 2500, "外套丢失", "k1");
    await retryCharge(deps, target, store.row("ch-1"));
    expect(stripe.charged).toBe(1);
    expect(store.rows[0].status).toBe("succeeded");
  });

  it("有一笔结果未知时，不能发起新的一笔", async () => {
    stripe.next = "after";
    await chargeCard(deps, target, 2500, "外套丢失", "k1");
    const blocked = await chargeCard(deps, target, 2500, "外套丢失", "k2");
    expect(blocked.status).toBe("busy");
    expect(stripe.charged).toBe(1);
  });

  it("刷新页面、换设备后：从数据库读到这笔，用存下的同一个键重试", async () => {
    stripe.next = "after";
    await chargeCard(deps, target, 2500, "外套丢失", "k1");
    // The admin page re-reads the row from the database (no form state survives)
    const fromDb = store.row("ch-1");
    expect(fromDb.idempotencyKey).toBe("k1");
    await retryCharge(deps, target, fromDb);
    expect(stripe.charged).toBe(1);
  });

  it("超过 24 小时（Stripe 已忘记这个键）：按扣款编号去 Stripe 查，查到就按结果记，不重新扣", async () => {
    stripe.next = "after";
    await chargeCard(deps, target, 2500, "外套丢失", "k1");
    clock += 25 * HOUR;
    stripe.forgetKeys();
    const outcome = await retryCharge(deps, target, store.row("ch-1"));
    expect(outcome.status).toBe("succeeded");
    expect(stripe.charged).toBe(1);
  });

  it("超过 24 小时、Stripe 上也没有：记为失败，之后可以重新发起", async () => {
    stripe.next = "before";
    await chargeCard(deps, target, 2500, "外套丢失", "k1");
    clock += 25 * HOUR;
    stripe.forgetKeys();
    expect((await retryCharge(deps, target, store.row("ch-1"))).status).toBe("failed");
    expect(stripe.charged).toBe(0);
    expect((await chargeCard(deps, target, 2500, "外套丢失", "k2")).status).toBe("succeeded");
  });

  it("卡在“正在扣款”超过 2 分钟（服务中途停了）：可以重试；刚开始的不能重试", async () => {
    await store.insertPending(target, 2500, "外套丢失", "k1");
    expect((await retryCharge(deps, target, store.row("ch-1"))).status).toBe("busy");
    clock += 3 * 60_000;
    expect((await retryCharge(deps, target, store.row("ch-1"))).status).toBe("succeeded");
    expect(stripe.charged).toBe(1);
  });

  it("已经有结果的扣款不能重试", async () => {
    await chargeCard(deps, target, 2500, "逾期", "k1");
    expect((await retryCharge(deps, target, store.row("ch-1"))).status).toBe("busy");
    expect(stripe.charged).toBe(1);
  });
});
