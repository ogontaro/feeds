import { expect, test } from "bun:test";
import type { LandscapeItem } from "../lib/landscape.ts";
import { type LandscapeUpdate, mergeLandscape } from "./landscape-update.ts";

const base: LandscapeItem = {
  name: "GitOps",
  quadrant: "platform",
  ring: "adopt",
  interest: "high",
  reason: "Argo CD",
  since: "2026-03",
  lastCited: "2026-03",
  trend: "stable",
};
const item = (over: Partial<LandscapeUpdate["items"][number]> = {}) => ({
  name: "GitOps",
  quadrant: "platform",
  ring: "adopt",
  interest: "high",
  reason: "Argo CD",
  cited: false,
  declining: false,
  ...over,
});

test("trend: new / up / stable / down", () => {
  const out = mergeLandscape(
    [base, { ...base, name: "IaC", lastCited: "2026-08" }, { ...base, name: "Old" }],
    {
      items: [
        item({ cited: true }),
        item({ name: "IaC" }),
        item({ name: "Old" }),
        item({ name: "SDD", quadrant: "practice" }),
      ],
    },
    "2026-09",
  );
  const trend = Object.fromEntries(out.map((i) => [i.name, i.trend]));
  expect(trend).toEqual({ GitOps: "up", IaC: "stable", Old: "down", SDD: "new" });
  expect(out.find((i) => i.name === "SDD")?.since).toBe("2026-09");
  expect(out.find((i) => i.name === "GitOps")?.since).toBe("2026-03");
});

test("items the AI left out are kept, removed ones need a reason", () => {
  const out = mergeLandscape([base, { ...base, name: "IaC" }], { items: [] }, "2026-09");
  expect(out.map((i) => i.name)).toEqual(["GitOps", "IaC"]);

  const removed = mergeLandscape(
    [base],
    { items: [], removed: [{ name: "GitOps", reason: "定着" }] },
    "2026-09",
  );
  expect(removed).toEqual([]);
  expect(() =>
    mergeLandscape([base], { items: [], removed: [{ name: "GitOps", reason: "" }] }, "2026-09"),
  ).toThrow();
});

test("invalid values fail loudly", () => {
  expect(() => mergeLandscape([], { items: [item({ ring: "adpot" })] }, "2026-09")).toThrow();
  expect(() => mergeLandscape([], { items: [item(), item()] }, "2026-09")).toThrow();
  expect(() => mergeLandscape([], { items: [item({ reason: " " })] }, "2026-09")).toThrow();
});
