import Parser from "rss-parser";
import { parseDocument } from "yaml";
import { SOURCE_YAML } from "./lib/paths.ts";

const RECENT_DAYS = 30;
const parser = new Parser({
  timeout: 20_000,
  headers: { "User-Agent": "ogontaro-rss/1.0 (+https://ogontaro.github.io/rss)" },
});

async function isValid(url: string): Promise<boolean> {
  try {
    const feed = await parser.parseURL(url);
    const cutoff = Date.now() - RECENT_DAYS * 24 * 3_600_000;
    return (feed.items ?? []).some((it) => {
      const d = it.isoDate ? new Date(it.isoDate).getTime() : 0;
      return d >= cutoff;
    });
  } catch {
    return false;
  }
}

/** Normalizes a URL for duplicate detection (protocol/host casing, trailing slash). */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

/** Drop today's newly-added feeds that fail to fetch/parse, have no recent activity, or duplicate an existing URL. */
async function main() {
  const raw = await Bun.file(SOURCE_YAML).text();
  const doc = parseDocument(raw);
  // biome-ignore lint/suspicious/noExplicitAny: yaml's CST node types don't cover this indexed-item shape cleanly
  const feedsSeq = doc.get("feeds") as any;
  const today = new Date().toISOString().slice(0, 10);

  const seenUrls = new Set<string>();
  for (const item of feedsSeq.items) {
    if (item.get("addedAt") !== today) seenUrls.add(normalizeUrl(item.get("url") as string));
  }

  const toRemove: number[] = [];
  for (let i = 0; i < feedsSeq.items.length; i++) {
    const item = feedsSeq.items[i];
    if (item.get("addedAt") !== today) continue; // only validate today's new additions
    const url = item.get("url") as string;
    const name = item.get("name") as string;

    if (seenUrls.has(normalizeUrl(url))) {
      console.log(`REMOVE ${name} (${url}) — duplicate of an existing feed`);
      toRemove.push(i);
      continue;
    }
    const ok = await isValid(url);
    console.log(`${ok ? "OK" : "REMOVE"} ${name} (${url})`);
    if (!ok) toRemove.push(i);
    else seenUrls.add(normalizeUrl(url)); // catch duplicates among today's own additions too
  }

  for (const i of toRemove.reverse()) feedsSeq.items.splice(i, 1);
  if (toRemove.length > 0) await Bun.write(SOURCE_YAML, doc.toString());
  console.log(`feed-audit-validate: removed ${toRemove.length} invalid new feed(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
