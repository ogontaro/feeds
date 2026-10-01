import { mkdir } from "node:fs/promises";
import { feedsOf, loadFeeds } from "../lib/config.ts";
import { parser, toText } from "../lib/feeds.ts";
import { domainArg } from "../lib/labels.ts";
import { CACHE, releaseInputJson } from "../lib/paths.ts";

const WINDOW_MS = 7 * 24 * 3_600_000;
const NOTES_MAX = 4000;
async function main() {
  const domain = domainArg();
  const cutoff = Date.now() - WINDOW_MS;
  const feeds = feedsOf(await loadFeeds(), domain, "release");
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
