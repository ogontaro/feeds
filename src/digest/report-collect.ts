import { mkdir } from "node:fs/promises";
import Parser from "rss-parser";
import { contentFeeds, loadFeeds, loadInterests } from "../lib/config.ts";
import { fetchFeed } from "../lib/feeds.ts";
import { domainArg } from "../lib/labels.ts";
import { CACHE, reportInputJson, translatedFile } from "../lib/paths.ts";
import { needsTranslation } from "../lib/urls.ts";

const WINDOW_MS = 24 * 3_600_000;
const MAX_ENTRIES = 50; // bound the Claude prompt; digest-style feeds can flood a day

const parser = new Parser();

type Candidate = {
  title: string;
  description: string;
  link: string;
  pubDate: Date;
  source: string;
};

/**
 * 入力の集め方はフィードごとに違う:
 * 海外サイトは翻訳フィード(translated/<id>.xml)から、
 * 日本語サイトは翻訳フィードを作らないので購読元を直接取得する。
 */
async function collectFeed(
  feed: Awaited<ReturnType<typeof loadFeeds>>[number],
): Promise<Candidate[]> {
  const source = feed.name;
  if (feed.id && needsTranslation(feed.url)) {
    const file = Bun.file(translatedFile(feed.id));
    if (!(await file.exists())) return [];
    const parsed = await parser.parseString(await file.text());
    return parsed.items.map((item) => ({
      title: (item.title ?? "").trim(),
      description: (item.contentSnippet ?? item.summary ?? "").trim(),
      link: (item.link ?? "").trim(),
      pubDate: item.isoDate ? new Date(item.isoDate) : new Date(),
      source,
    }));
  }
  const entries = await fetchFeed(feed);
  return entries.map((e) => ({
    title: e.title,
    description: e.description,
    link: e.link,
    pubDate: e.pubDate,
    source,
  }));
}

async function main() {
  const domain = domainArg();
  const cutoff = Date.now() - WINDOW_MS;
  const { exclude } = await loadInterests(domain);
  const excludeLower = exclude.map((k) => k.toLowerCase());
  const isExcluded = (c: Candidate) => {
    const text = `${c.title} ${c.description}`.toLowerCase();
    return excludeLower.some((k) => text.includes(k));
  };

  const feeds = contentFeeds(await loadFeeds(), domain);
  const all: Candidate[] = [];
  for (const feed of feeds) {
    try {
      all.push(...(await collectFeed(feed)));
    } catch (err) {
      console.error(`[${domain}] skip ${feed.name}: ${(err as Error).message}`);
    }
  }

  const withinWindow = all.filter((c) => c.pubDate.getTime() >= cutoff);
  const afterExclude = withinWindow.filter((c) => !isExcluded(c));
  const recent = afterExclude
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, MAX_ENTRIES)
    .map((c) => ({
      title: c.title,
      description: c.description,
      link: c.link,
      source: c.source,
      published: c.pubDate.toISOString(),
    }));

  await mkdir(CACHE, { recursive: true });
  await Bun.write(reportInputJson(domain), JSON.stringify(recent, null, 2));
  const excludedCount = withinWindow.length - afterExclude.length;
  console.log(
    `report-${domain}-input.json: ${recent.length} entries (last 24h, ${excludedCount} excluded by interests.yaml)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
