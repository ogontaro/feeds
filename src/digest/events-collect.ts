import { mkdir } from "node:fs/promises";
import { CACHE, EVENTS_INPUT_JSON, EVENTS_INPUT_MD } from "../lib/paths.ts";

/**
 * 月次イベントの入力。developers.events の公開データから、今後 60 日に開催されるものと
 * CFP が締まるものを集める。国内は全件、海外は主要シリーズと関心の高いタグに絞る。
 */

const SOURCE_URL = "https://developers.events/all-events.json";
const WINDOW_DAYS = 60;
/** CFP が近いイベントは、開催が先でも応募先として拾う。 */
const CFP_EVENT_DAYS = 180;
const MAX_ITEMS = 150;

/**
 * 規模のデータが無いため、「主要」は会議シリーズ名で判定する。
 * 地域版しか無い KCD / DevOpsDays / DevFest はここには含めず、タグで拾う。
 */
const MAJOR =
  /KubeCon|Open Source Summit|GitHub Universe|Google Cloud Next|AWS re:Invent|AWS Summit|Microsoft Ignite|NVIDIA GTC|WWDC|Google I\/O|DockerCon|PyCon US|PyCon JP|FOSDEM|Devoxx|SREcon|QCon|Platform Engineering Day|AGNTCon|MCPCon|MCP Dev Summit|TechCrunch Disrupt|\bCES\b|\bGDC\b|Tokyo Game Show/i;

/** 読者の関心（AI・Kubernetes・クラウド）に直結するタグ。 */
const CORE_TAGS = new Set([
  "kubernetes",
  "cloud-native",
  "ai",
  "machine-learning",
  "artificial-intelligence",
  "llm",
  "agents",
]);

export type RawEvent = {
  name?: string;
  date?: [number, number];
  hyperlink?: string;
  location?: string;
  city?: string;
  country?: string;
  status?: string;
  tags?: Array<{ key?: string; value?: string }>;
  cfp?: { link?: string; until?: string; untilDate?: number };
};

export type EventItem = {
  name: string;
  start: string;
  end: string;
  location: string;
  online: boolean;
  link: string;
  tags: string[];
  cfp: { until: string; link: string } | null;
  japan: boolean;
  major: boolean;
};

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** 候補を選ぶ。now はテストのために渡せる。 */
export function selectEvents(raw: RawEvent[], now = Date.now()): EventItem[] {
  const windowEnd = now + WINDOW_DAYS * DAY;
  const seen = new Set<string>();
  const items: EventItem[] = [];

  for (const event of raw) {
    const name = event.name?.trim();
    const date = event.date;
    const link = event.hyperlink?.trim();
    if (!name || !date || !link) continue;
    if (!["open", "virtualized"].includes((event.status ?? "open").toLowerCase())) continue;

    const start = date[0];
    const end = Number.isFinite(date[1]) ? date[1] : start;
    if (!Number.isFinite(start)) continue;
    const location =
      event.location?.trim() || [event.city, event.country].filter(Boolean).join(", ");
    const online = /online/i.test(location) || event.country?.toLowerCase() === "online";
    const japan = event.country?.toLowerCase() === "japan";
    const tags = (event.tags ?? [])
      .map((tag) => tag.value?.toLowerCase() ?? "")
      .filter((tag) => tag !== "");
    const core = tags.some((tag) => CORE_TAGS.has(tag));
    const major = MAJOR.test(name);
    const soon = end >= now && start <= windowEnd;
    const cfpUntil = event.cfp?.untilDate;
    const cfpSoon =
      typeof cfpUntil === "number" && cfpUntil >= now && cfpUntil <= windowEnd && end >= now;

    const include =
      (japan && (soon || cfpSoon)) ||
      (major && (soon || (cfpSoon && start <= now + CFP_EVENT_DAYS * DAY))) ||
      (soon && core && !online) ||
      (cfpSoon && core && start <= now + 120 * DAY);
    if (!include) continue;

    const key = `${name}|${iso(start)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      name,
      start: iso(start),
      end: iso(end),
      location,
      online,
      link,
      tags,
      cfp:
        typeof cfpUntil === "number" && cfpUntil >= now
          ? { until: iso(cfpUntil), link: event.cfp?.link ?? link }
          : null,
      japan,
      major,
    });
  }

  return items
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
    .slice(0, MAX_ITEMS);
}

function toMarkdown(items: EventItem[], now: Date): string {
  const lines = [
    `# イベント候補 — ${iso(now.getTime())} 時点（開催は今後${WINDOW_DAYS}日、CFP は今後${WINDOW_DAYS}日締切）`,
    "",
    `候補 ${items.length} 件。国内は全件、海外は主要シリーズと AI・Kubernetes・クラウド系のタグで絞ってあります。`,
    "",
  ];
  items.forEach((item, i) => {
    lines.push(
      `## ${i + 1}. ${item.name}`,
      `- 開催日: ${item.start} 〜 ${item.end}`,
      `- 場所: ${item.location}${item.online ? "（オンライン）" : ""}`,
      `- 区分: ${item.japan ? "国内" : "海外"}${item.major ? " / 主要シリーズ" : ""}`,
      `- タグ: ${item.tags.length > 0 ? item.tags.join(", ") : "なし"}`,
      ...(item.cfp ? [`- CFP: ${item.cfp.until} 締切 / ${item.cfp.link}`] : []),
      `- リンク: ${item.link}`,
      "",
    );
  });
  return lines.join("\n");
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "ogontaro-feeds-events" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${SOURCE_URL}`);

  const raw = (await res.json()) as RawEvent[];
  const now = new Date();
  const items = selectEvents(raw, now.getTime());

  await mkdir(CACHE, { recursive: true });
  await Bun.write(EVENTS_INPUT_JSON, JSON.stringify(items, null, 2));
  await Bun.write(EVENTS_INPUT_MD, toMarkdown(items, now));
  console.log(`events-input.md: ${items.length} items`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
