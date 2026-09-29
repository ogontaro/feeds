import { parse, parseDocument } from "yaml";
import { INTERESTS, type LandscapeItem, QUADRANTS, RINGS, type Trend } from "../lib/landscape.ts";
import { LANDSCAPE_UPDATE_YAML, LANDSCAPE_YAML, TREND_INPUT_MD } from "../lib/paths.ts";

/** AI が書く更新案(report-criteria/landscape.md の出力フォーマット)。 */
export type LandscapeUpdate = {
  items: {
    name: string;
    quadrant: string;
    ring: string;
    interest: string;
    reason: string;
    /** 今月の月次トレンドで取り上げられたか */
    cited: boolean;
    /** 今月の月次トレンドが衰退・リスクを指摘したか */
    declining: boolean;
  }[];
  removed?: { name: string; reason: string }[];
  changes?: string[];
};

const MAX_ITEMS = 30;
/** この月数トレンドで取り上げられなければ ▼(下降)にする */
const STALE_MONTHS = 6;

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function trendOf(
  existed: boolean,
  cited: boolean,
  declining: boolean,
  lastSeen: string,
  month: string,
): Trend {
  if (!existed) return "new";
  if (declining) return "down";
  if (cited) return "up";
  return monthsBetween(lastSeen, month) >= STALE_MONTHS ? "down" : "stable";
}

function assertEnum(value: string, allowed: readonly string[], field: string, name: string) {
  if (!allowed.includes(value)) {
    throw new Error(`${name}: ${field} must be one of ${allowed.join("/")} (got "${value}")`);
  }
}

/**
 * 前回の items に AI の更新案を重ねる。AI が書き漏らした既存項目は消さずに残し(黙って消えるのを防ぐ)、
 * 外すのは removed に理由付きで挙げたものだけ。trend / since / lastCited はここで計算する。
 */
export function mergeLandscape(
  prev: LandscapeItem[],
  update: LandscapeUpdate,
  month: string,
): LandscapeItem[] {
  const prevByName = new Map(prev.map((i) => [i.name, i]));
  const removed = new Set((update.removed ?? []).map((r) => r.name));
  for (const r of update.removed ?? []) {
    if (!prevByName.has(r.name)) throw new Error(`removed: "${r.name}" is not in landscape.yaml`);
    if (!r.reason?.trim()) throw new Error(`removed: "${r.name}" has no reason`);
  }

  const seen = new Set<string>();
  const out: LandscapeItem[] = [];
  for (const u of update.items ?? []) {
    const name = u.name?.trim();
    if (!name) throw new Error("item without name");
    if (seen.has(name)) throw new Error(`${name}: duplicated`);
    if (removed.has(name)) throw new Error(`${name}: listed in both items and removed`);
    seen.add(name);
    assertEnum(u.quadrant, QUADRANTS, "quadrant", name);
    assertEnum(u.ring, RINGS, "ring", name);
    assertEnum(u.interest, INTERESTS, "interest", name);
    if (!u.reason?.trim()) throw new Error(`${name}: reason is empty`);

    const p = prevByName.get(name);
    const lastCited = u.cited ? month : (p?.lastCited ?? null);
    out.push({
      name,
      quadrant: u.quadrant as LandscapeItem["quadrant"],
      ring: u.ring as LandscapeItem["ring"],
      interest: u.interest as LandscapeItem["interest"],
      reason: u.reason.trim(),
      since: p?.since ?? month,
      lastCited,
      trend: trendOf(!!p, !!u.cited, !!u.declining, lastCited ?? p?.since ?? month, month),
    });
  }

  for (const p of prev) {
    if (seen.has(p.name) || removed.has(p.name)) continue;
    console.warn(`kept "${p.name}": missing from the update and not removed`);
    out.push({ ...p, trend: trendOf(true, false, false, p.lastCited ?? p.since, month) });
  }

  if (out.length > MAX_ITEMS) throw new Error(`too many items: ${out.length} > ${MAX_ITEMS}`);
  return out;
}

async function main() {
  const month = (await Bun.file(TREND_INPUT_MD).text()).match(/^# 対象月: (\d{4}-\d{2})/)?.[1];
  if (!month) throw new Error(`${TREND_INPUT_MD} has no 対象月 header`);

  const raw = await Bun.file(LANDSCAPE_YAML).text();
  const doc = parseDocument(raw);
  const prev = (doc.toJS().items ?? []) as LandscapeItem[];
  const update = parse(await Bun.file(LANDSCAPE_UPDATE_YAML).text()) as LandscapeUpdate;
  const items = mergeLandscape(prev, update, month);

  // focus(本人が書く関心領域)とファイル先頭のコメントには触らない
  doc.set("updated", month);
  doc.set("changes", update.changes ?? []);
  doc.set("items", items);
  await Bun.write(LANDSCAPE_YAML, doc.toString({ lineWidth: 0 }));
  console.log(`landscape.yaml: ${items.length} items (${month})`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
