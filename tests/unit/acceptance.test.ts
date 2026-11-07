import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptOrder,
  declineOrder,
  sweepAcceptance,
  type AcceptanceDeps,
  type AcceptanceStore,
} from "@/lib/booking/acceptance";

/** 邮寄急单（不加急）：店主接单、拒单、超时自动拒单（src/lib/booking/acceptance.ts） */
const HOUR = 3_600_000;
let clock: number;

interface Order {
  status: "pending" | "confirmed" | "cancelled";
  acceptance: "awaiting" | "accepted" | "declined";
  paidAt: number | null;
  paidCents: number | null;
  refundStatus: "due" | null;
  refundCents: number | null;
  remindedAt: number | null;
}

class FakeStore implements AcceptanceStore {
  orders = new Map<string, Order>();
  add(id: string, extra: Partial<Order> = {}) {
    this.orders.set(id, {
      status: "pending",
      acceptance: "awaiting",
      paidAt: clock,
      paidCents: 9400,
      refundStatus: null,
      refundCents: null,
      remindedAt: null,
      ...extra,
    });
  }
  async accept(id: string) {
    const o = this.orders.get(id)!;
    if (o.status !== "pending" || o.acceptance !== "awaiting" || o.paidAt === null) return false;
    Object.assign(o, { status: "confirmed", acceptance: "accepted" });
    return true;
  }
  async decline(id: string) {
    const o = this.orders.get(id)!;
    if (o.status !== "pending" || o.acceptance !== "awaiting") return null;
    Object.assign(o, { status: "cancelled", acceptance: "declined" });
    if (o.paidCents) Object.assign(o, { refundStatus: "due", refundCents: o.paidCents });
    return { refundCents: o.paidCents ?? 0 };
  }
  async awaitingPaid() {
    return [...this.orders.entries()]
      .filter(([, o]) => o.status === "pending" && o.acceptance === "awaiting" && o.paidAt !== null)
      .map(([id, o]) => ({ id, paidAt: new Date(o.paidAt!), remindedAt: o.remindedAt === null ? null : new Date(o.remindedAt) }));
  }
  async markReminded(id: string) {
    const o = this.orders.get(id)!;
    if (o.remindedAt !== null) return false;
    o.remindedAt = clock;
    return true;
  }
}

let store: FakeStore;
let events: string[];
let deps: AcceptanceDeps;

beforeEach(() => {
  clock = Date.parse("2026-12-01T12:00:00Z");
  store = new FakeStore();
  events = [];
  deps = {
    store,
    now: () => new Date(clock),
    onAccepted: (id) => events.push(`accepted ${id}`),
    onDeclined: (id, cents, automatic) => events.push(`declined ${id} ${cents} ${automatic ? "auto" : "owner"}`),
    onRemind: (id, deadline) => events.push(`remind ${id} ${deadline.toISOString()}`),
  };
});

describe("店主接单 / 拒单", () => {
  it("接单：订单确认，通知顾客", async () => {
    store.add("o1");
    expect(await acceptOrder(deps, "o1")).toBe(true);
    expect(store.orders.get("o1")).toMatchObject({ status: "confirmed", acceptance: "accepted" });
    expect(events).toEqual(["accepted o1"]);
  });

  it("拒单：订单取消、标为待退款（全额），通知顾客", async () => {
    store.add("o1");
    expect(await declineOrder(deps, "o1")).toBe(true);
    expect(store.orders.get("o1")).toMatchObject({ status: "cancelled", acceptance: "declined", refundStatus: "due", refundCents: 9400 });
    expect(events).toEqual(["declined o1 9400 owner"]);
  });

  it("顾客还没付款：不能接单；可以拒单（没有要退的钱）", async () => {
    store.add("o1", { paidAt: null, paidCents: null });
    expect(await acceptOrder(deps, "o1")).toBe(false);
    expect(await declineOrder(deps, "o1")).toBe(true);
    expect(store.orders.get("o1")).toMatchObject({ status: "cancelled", refundStatus: null });
  });

  it("已经处理过：再点接单或拒单都不起作用，也不会重复发邮件", async () => {
    store.add("o1");
    await acceptOrder(deps, "o1");
    expect(await declineOrder(deps, "o1")).toBe(false);
    expect(await acceptOrder(deps, "o1")).toBe(false);
    expect(events).toEqual(["accepted o1"]);
  });
});

describe("超时处理（定期任务）", () => {
  it("付款后 12 小时提醒店主一次，24 小时还没处理就自动拒单", async () => {
    store.add("o1");
    clock += 11 * HOUR;
    expect(await sweepAcceptance(deps)).toEqual({ reminded: 0, declined: 0 });

    clock += 2 * HOUR;
    expect(await sweepAcceptance(deps)).toEqual({ reminded: 1, declined: 0 });
    expect(await sweepAcceptance(deps)).toEqual({ reminded: 0, declined: 0 });
    expect(events).toEqual(["remind o1 2026-12-02T12:00:00.000Z"]);

    clock += 11 * HOUR;
    expect(await sweepAcceptance(deps)).toEqual({ reminded: 0, declined: 1 });
    expect(store.orders.get("o1")).toMatchObject({ status: "cancelled", acceptance: "declined", refundStatus: "due" });
    expect(events.at(-1)).toBe("declined o1 9400 auto");
  });

  it("已接单、已拒单、还没付款的订单：定期任务不碰", async () => {
    store.add("accepted", { status: "confirmed", acceptance: "accepted" });
    store.add("declined", { status: "cancelled", acceptance: "declined" });
    store.add("unpaid", { paidAt: null });
    clock += 48 * HOUR;
    expect(await sweepAcceptance(deps)).toEqual({ reminded: 0, declined: 0 });
    expect(store.orders.get("unpaid")!.status).toBe("pending");
  });

  it("店主刚好在超时那一刻接单：只会有一个结果", async () => {
    store.add("o1");
    clock += 25 * HOUR;
    const [accepted, swept] = await Promise.all([acceptOrder(deps, "o1"), sweepAcceptance(deps)]);
    const o = store.orders.get("o1")!;
    expect(accepted ? o.status === "confirmed" && swept.declined === 0 : o.status === "cancelled").toBe(true);
    expect(events).toHaveLength(1);
  });
});
