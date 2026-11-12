import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ availability: vi.fn() }));
vi.mock("@/lib/catalog", () => ({
  getSettings: async () => ({ maxRentalDays: 10, glovesMaxRentalDays: 10 }),
  getToday: async () => "2027-01-01",
  getAvailability: mocks.availability,
  availableCounts: (map: Map<string, { available: number }[]>) =>
    new Map([...map].map(([id, sizes]) => [id, sizes.reduce((sum, s) => sum + s.available, 0)])),
}));
import { GET } from "../../src/app/api/availability/route";
const id = "123e4567-e89b-42d3-a456-426614174000";
const request = (extra: string) => ({
  nextUrl: new URL(`http://localhost/api/availability?start=2027-01-05&end=2027-01-06&${extra}`),
}) as NextRequest;

beforeEach(() => {
  mocks.availability.mockReset();
  mocks.availability.mockImplementation(async ({ fulfillment }: { fulfillment?: string }) => new Map([
    [id, [{ size: "M", total: 2, available: fulfillment === "shipping" ? 0 : 1 }]],
    ["accessory", [{ size: "S", total: 3, available: 2 }]],
  ]));
});
it("combines chosen style and accessories with just two live database reads", async () => {
  const response = await GET(request(`styleId=${id}&includeAddOns=1`));
  const body = await response.json();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(body.sizes).toEqual([{size:"M",total:2,available:1,shippingAvailable:0}]);
  expect(body.counts.accessory).toBe(2);
  expect(body.shippingSizeCounts[id].M).toBe(0);
  expect(mocks.availability).toHaveBeenCalledTimes(2);
  expect(mocks.availability).toHaveBeenCalledWith({start:"2027-01-05",end:"2027-01-06",styleId:undefined});
});
it("keeps standalone style requests scoped to that style", async () => {
  const response = await GET(request(`styleId=${id}`));
  expect((await response.json()).counts).toBeUndefined();
  expect(mocks.availability).toHaveBeenCalledWith({start:"2027-01-05",end:"2027-01-06",styleId:id});
});
it("preserves the existing all-styles response", async () => {
  const body = await (await GET(request(""))).json();
  expect(body.sizeCounts[id].M).toBe(1);
  expect(body.shippingCounts[id]).toBe(0);
});
it("rejects unsupported combined-query flags before querying the database", async () => {
  expect((await GET(request(`styleId=${id}&includeAddOns=bad`))).status).toBe(400);
  expect(mocks.availability).not.toHaveBeenCalled();
});
