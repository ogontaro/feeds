import { CONTENT_DOMAINS, contentFeeds, loadFeeds } from "./lib/config.ts";
import { readDomainFeed, writeDomainFeed } from "./lib/domain-feed.ts";
import { fetchFeed } from "./lib/feeds.ts";
import { isDegraded, translateBatch } from "./lib/translate.ts";
import type { TranslatedEntry } from "./lib/types.ts";
import { isJapaneseSource } from "./lib/urls.ts";

// --strict: exit non-zero if any domain had zero feeds load (used by translate.yml).
// Without it (used inside report.yml) a partial failure just refreshes what it can.
const strict = process.argv.includes("--strict");

async function main() {
  const feeds = await loadFeeds();
  const skipped: string[] = [];

  for (const domain of CONTENT_DOMAINS) {
    const domainFeeds = contentFeeds(feeds, domain);
    const existing = await readDomainFeed(domain);
    const known = new Set(existing.map((e) => e.guid));
    const fresh: TranslatedEntry[] = [];
    let anyFeedOk = false;

    for (const feed of domainFeeds) {
      let entries: Awaited<ReturnType<typeof fetchFeed>>;
      try {
        entries = await fetchFeed(feed);
        anyFeedOk = true;
      } catch (err) {
        console.error(`[${domain}] skip ${feed.name}: ${(err as Error).message}`);
        continue;
      }

      const novel = entries.filter((e) => !known.has(e.guid));
      if (novel.length === 0) continue;

      // 日本語ソース（DevelopersIO / Zenn / Qiita 等）は原文がそのまま日本語なので翻訳しない。
      // translateBatch は空文字をエンジンに渡さずそのまま返すため、空文字を渡して素通しさせる。
      const forTranslation = (s: string, link: string) => (isJapaneseSource(link) ? "" : s);
      const titlesJa = await translateBatch(novel.map((e) => forTranslation(e.title, e.link)));
      const descsJa = await translateBatch(novel.map((e) => forTranslation(e.description, e.link)));
      novel.forEach((e, i) => {
        known.add(e.guid);
        fresh.push({
          guid: e.guid,
          link: e.link,
          titleJa: titlesJa[i],
          descriptionJa: descsJa[i],
          pubDate: e.pubDate,
          sourceName: e.sourceName,
        });
      });
      console.log(`[${domain}] ${feed.name}: +${novel.length}`);
    }

    if (!anyFeedOk) {
      console.error(`[${domain}] every feed failed — leaving translated-${domain}.xml untouched`);
      skipped.push(domain);
      continue;
    }

    const count = await writeDomainFeed(domain, [...fresh, ...existing]);
    console.log(`[${domain}] translated-${domain}.xml: ${count} items (+${fresh.length} new)`);
  }

  if (isDegraded()) {
    console.warn(
      "[translate] 翻訳エンジンが枠切れ／認証エラー — 一部エントリを未翻訳で公開しました",
    );
  }
  if (skipped.length > 0 && strict) {
    console.error(`domains skipped: ${skipped.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
