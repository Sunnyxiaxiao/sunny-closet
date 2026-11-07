import { beforeEach, describe, expect, it } from "vitest";
import {
  deliver,
  MAX_AUTO_ATTEMPTS,
  resend,
  retryFailed,
  type DeliveryDeps,
  type EmailLogEntry,
  type EmailLogStore,
} from "@/lib/email/delivery";

/** 订单邮件：先记录再发，失败的定期重试，后台可以重发（src/lib/email/delivery.ts） */
const MINUTE = 60_000;
let clock: number;

class FakeStore implements EmailLogStore {
  rows = new Map<string, EmailLogEntry & { lastError: string | null }>();
  private n = 0;
  async create(bookingId: string, kind: EmailLogEntry["kind"], params: Record<string, unknown>) {
    const row = { id: `e${++this.n}`, bookingId, kind, params, status: "sending" as const, attempts: 1, updatedAt: new Date(clock), lastError: null };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async claim(entry: EmailLogEntry, stuckBefore: Date) {
    const row = this.rows.get(entry.id)!;
    const takeable = row.status === "failed" || (row.status === "sending" && row.updatedAt < stuckBefore);
    if (!takeable || row.attempts !== entry.attempts) return null;
    Object.assign(row, { status: "sending", attempts: row.attempts + 1, updatedAt: new Date(clock) });
    return { ...row };
  }
  async markSent(id: string) {
    Object.assign(this.rows.get(id)!, { status: "sent", lastError: null, updatedAt: new Date(clock) });
  }
  async markFailed(id: string, error: string) {
    Object.assign(this.rows.get(id)!, { status: "failed", lastError: error, updatedAt: new Date(clock) });
  }
  async retryable(maxAttempts: number, stuckBefore: Date) {
    return [...this.rows.values()]
      .filter((r) => r.attempts < maxAttempts && (r.status === "failed" || (r.status === "sending" && r.updatedAt < stuckBefore)))
      .map((r) => ({ ...r }));
  }
  async get(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
}

let store: FakeStore;
let sent: string[];
let smtpDown: boolean;
let deps: DeliveryDeps;

beforeEach(() => {
  clock = Date.parse("2026-12-01T12:00:00Z");
  store = new FakeStore();
  sent = [];
  smtpDown = false;
  deps = {
    store,
    now: () => new Date(clock),
    build: async (bookingId, kind) => (bookingId === "gone" ? null : { to: "c@x.co", subject: `${kind} ${bookingId}`, text: "", html: "" }),
    send: async (message) => {
      if (smtpDown) throw new Error("Greeting never received");
      sent.push(message.subject);
    },
  };
});

const only = () => [...store.rows.values()][0];

describe("订单邮件发送记录", () => {
  it("发送成功：记为已发送", async () => {
    expect(await deliver(deps, "o1", "order_confirmed")).toBe(true);
    expect(sent).toEqual(["order_confirmed o1"]);
    expect(only()).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("发送失败：记下原因，不抛错（下单流程照常）", async () => {
    smtpDown = true;
    expect(await deliver(deps, "o1", "new_order")).toBe(false);
    expect(only()).toMatchObject({ status: "failed", attempts: 1, lastError: "Greeting never received" });
  });

  it("订单不在了：记为失败，说明原因", async () => {
    expect(await deliver(deps, "gone", "order_confirmed")).toBe(false);
    expect(only()).toMatchObject({ status: "failed", lastError: "找不到这张订单" });
  });
});

describe("定期重试", () => {
  it(`失败的邮件自动重试，最多一共试 ${MAX_AUTO_ATTEMPTS} 次`, async () => {
    smtpDown = true;
    await deliver(deps, "o1", "order_confirmed");
    for (let i = 0; i < 5; i += 1) {
      clock += 15 * MINUTE;
      await retryFailed(deps);
    }
    expect(only()).toMatchObject({ status: "failed", attempts: MAX_AUTO_ATTEMPTS });
    expect(sent).toEqual([]);
  });

  it("邮箱恢复后，下一次重试就发出去，之后不再重发", async () => {
    smtpDown = true;
    await deliver(deps, "o1", "order_confirmed");
    smtpDown = false;
    clock += 15 * MINUTE;
    expect(await retryFailed(deps)).toEqual({ sent: 1, failed: 0 });
    expect(await retryFailed(deps)).toEqual({ sent: 0, failed: 0 });
    expect(sent).toEqual(["order_confirmed o1"]);
  });

  it("发到一半服务器停了（一直停在“发送中”）：15 分钟后才当作失败重试，正在发的不碰", async () => {
    await store.create("o1", "new_order", {});
    clock += 5 * MINUTE;
    expect(await retryFailed(deps)).toEqual({ sent: 0, failed: 0 });
    clock += 11 * MINUTE;
    expect(await retryFailed(deps)).toEqual({ sent: 1, failed: 0 });
    expect(only()).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("定期任务和后台重发同时进行：只发一封", async () => {
    smtpDown = true;
    await deliver(deps, "o1", "order_confirmed");
    smtpDown = false;
    clock += 15 * MINUTE;
    await Promise.all([retryFailed(deps), resend(deps, only().id)]);
    expect(sent).toEqual(["order_confirmed o1"]);
  });
});

describe("后台重发", () => {
  it("自动重试用完了也能手动重发", async () => {
    smtpDown = true;
    await deliver(deps, "o1", "order_confirmed");
    for (let i = 0; i < MAX_AUTO_ATTEMPTS; i += 1) await retryFailed(deps);
    smtpDown = false;
    expect(await resend(deps, only().id)).toBe(true);
    expect(only()).toMatchObject({ status: "sent", attempts: MAX_AUTO_ATTEMPTS + 1 });
  });

  it("已经发出去的不会再发", async () => {
    await deliver(deps, "o1", "order_confirmed");
    expect(await resend(deps, only().id)).toBe(false);
    expect(sent).toHaveLength(1);
  });
});
