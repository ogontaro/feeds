import { mkdir } from "node:fs/promises";
import Parser from "rss-parser";
import { loadFeeds, releaseFeeds } from "../lib/config.ts";
import { domainArg } from "../lib/labels.ts";
import { CACHE, releaseInputJson } from "../lib/paths.ts";

const WINDOW_MS = 7 * 24 * 3_600_000;
const NOTES_MAX = 4000;
const parser = new Parser({
  timeout: 20_000,
  headers: { "User-Agent": "ogontaro-feeds/1.0 (+https://ogontaro.github.io/feeds)" },
});

function toText(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function main() {
  const domain = domainArg();
  const cutoff = Date.now() - WINDOW_MS;
  const feeds = releaseFeeds(await loadFeeds(), domain);
  const items: unknown[] = [];
  let anyFeedOk = false;

  for (const feed of feeds) {
    let parsed: Awaited<ReturnType<typeof parser.parseURL>>;
    try {
      parsed = await parser.parseURL(feed.url);
      anyFeedOk = true;
    } catch (err) {
      console.error(`skip ${feed.name}: ${(err as Error).message}`);
      continue;
    }
    for (const it of parsed.items) {
      const pub = it.isoDate ? new Date(it.isoDate) : null;
      if (!pub || pub.getTime() < cutoff) continue;
      items.push({
        project: feed.name,
        version: (it.title ?? "").trim(),
        link: (it.link ?? "").trim(),
        published: pub.toISOString(),
        notes: toText(it.content ?? it.contentSnippet ?? "").slice(0, NOTES_MAX),
      });
    }
  }

  if (!anyFeedOk) {
    console.error(`[${domain}] every release feed failed`);
    process.exit(1);
  }

  await mkdir(CACHE, { recursive: true });
  await Bun.write(releaseInputJson(domain), JSON.stringify(items, null, 2));
  console.log(`release-${domain}-input.json: ${items.length} releases (last 7d)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
