import { expect, test } from "bun:test";
import { type RawEvent, selectEvents } from "./events-collect.ts";

const now = Date.parse("2026-10-22T00:00:00Z");
const day = 86_400_000;
const at = (days: number) => now + days * day;

const event = (over: Partial<RawEvent> = {}): RawEvent => ({
  name: "Some Conf",
  date: [at(10), at(11)],
  hyperlink: "https://example.com/conf",
  location: "Berlin (Germany)",
  country: "Germany",
  status: "open",
  tags: [{ key: "topic", value: "php" }],
  ...over,
});

test("domestic events are always included", () => {
  const items = selectEvents([event({ country: "Japan", location: "Tokyo (Japan)" })], now);
  expect(items.map((i) => i.name)).toEqual(["Some Conf"]);
  expect(items[0].japan).toBe(true);
});

test("overseas events need a major series or a core tag", () => {
  expect(selectEvents([event()], now)).toEqual([]);

  const major = selectEvents([event({ name: "KubeCon + CloudNativeCon NA 2026" })], now);
  expect(major.map((i) => i.name)).toEqual(["KubeCon + CloudNativeCon NA 2026"]);

  const core = selectEvents([event({ tags: [{ value: "ai" }] })], now);
  expect(core.map((i) => i.name)).toEqual(["Some Conf"]);

  const online = selectEvents(
    [event({ tags: [{ value: "ai" }], country: "Online", location: "Online" })],
    now,
  );
  expect(online).toEqual([]);
});

test("a near CFP pulls in a later event, but past CFPs are dropped", () => {
  const later = event({
    name: "MCPCon 2027",
    date: [at(150), at(151)],
    cfp: { link: "https://example.com/cfp", untilDate: at(5) },
  });
  const [item] = selectEvents([later], now);
  expect(item.name).toBe("MCPCon 2027");
  expect(item.cfp).toEqual({ until: "2026-10-27", link: "https://example.com/cfp" });

  const past = selectEvents(
    [event({ country: "Japan", location: "Tokyo (Japan)", cfp: { link: "x", untilDate: at(-5) } })],
    now,
  );
  expect(past[0].cfp).toBe(null);
});

test("canceled events and duplicate rows are dropped", () => {
  const items = selectEvents(
    [
      event({ country: "Japan", location: "Tokyo (Japan)", status: "Canceled" }),
      event({ country: "Japan", location: "Tokyo (Japan)" }),
      event({ country: "Japan", location: "Tokyo (Japan)" }),
    ],
    now,
  );
  expect(items.length).toBe(1);
});
