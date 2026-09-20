import { mkdir } from "node:fs/promises";
import { loadInterests } from "./lib/config.ts";
import { readDomainFeed } from "./lib/domain-feed.ts";
import { domainArg } from "./lib/labels.ts";
import { CACHE, reportInputJson } from "./lib/paths.ts";

const WINDOW_MS = 24 * 3_600_000;
const MAX_ENTRIES = 50; // bound the Claude prompt; digest-style feeds can flood a day

async function main() {
  const domain = domainArg();
  const cutoff = Date.now() - WINDOW_MS;
  const { exclude } = await loadInterests(domain);
  const excludeLower = exclude.map((k) => k.toLowerCase());
  const isExcluded = (title: string, description: string) => {
    const text = `${title} ${description}`.toLowerCase();
    return excludeLower.some((k) => text.includes(k));
  };

  const withinWindow = (await readDomainFeed(domain)).filter((e) => e.pubDate.getTime() >= cutoff);
  const afterExclude = withinWindow.filter((e) => !isExcluded(e.titleJa, e.descriptionJa));
  const recent = afterExclude
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, MAX_ENTRIES)
    .map((e) => ({
      title: e.titleJa,
      description: e.descriptionJa,
      link: e.link,
      source: e.sourceName,
      published: e.pubDate.toISOString(),
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
