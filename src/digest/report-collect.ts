import { mkdir } from "node:fs/promises";
import { feedsOf, loadFeeds, loadInterests } from "../lib/config.ts";
import { fetchFeed, resolveGoogleNewsLink } from "../lib/feeds.ts";
import { domainArg } from "../lib/labels.ts";
import { CACHE, reportInputJson } from "../lib/paths.ts";
import type { Entry } from "../lib/types.ts";

const WINDOW_MS = 24 * 3_600_000;
const MAX_ENTRIES = 50; // bound the Claude prompt; digest-style feeds can flood a day
// 多弁なフィード（CCログは毎日 ~20 件が同一時刻で入る）が低頻度の公式ソースを押し出さないように。
const MAX_PER_SOURCE = 8;

async function main() {
  const domain = domainArg();
  const cutoff = Date.now() - WINDOW_MS;
  const { exclude } = await loadInterests(domain);
  const excludeLower = exclude.map((k) => k.toLowerCase());
  const isExcluded = (c: Entry) => {
    const text = `${c.title} ${c.description}`.toLowerCase();
    return excludeLower.some((k) => text.includes(k));
  };

  const feeds = feedsOf(await loadFeeds(), domain, "content");
  const all: Entry[] = [];
  for (const feed of feeds) {
    try {
      all.push(...(await fetchFeed(feed)));
    } catch (err) {
      console.error(`[${domain}] skip ${feed.name}: ${(err as Error).message}`);
    }
  }

  const withinWindow = all.filter((c) => c.pubDate.getTime() >= cutoff);
  const afterExclude = withinWindow.filter((c) => !isExcluded(c));
  const perSource = new Map<string, number>();
  const recent = afterExclude
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .filter((c) => {
      const n = (perSource.get(c.source) ?? 0) + 1;
      perSource.set(c.source, n);
      return n <= MAX_PER_SOURCE;
    })
    .slice(0, MAX_ENTRIES);
  const input = [];
  for (const c of recent) {
    input.push({
      title: c.title,
      description: c.description,
      link: await resolveGoogleNewsLink(c.link),
      source: c.source,
      published: c.pubDate.toISOString(),
    });
  }

  await mkdir(CACHE, { recursive: true });
  await Bun.write(reportInputJson(domain), JSON.stringify(input, null, 2));
  const excludedCount = withinWindow.length - afterExclude.length;
  console.log(
    `report-${domain}-input.json: ${input.length} entries (last 24h, ${excludedCount} excluded by interests.yaml)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
