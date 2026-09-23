import { loadFeeds } from "../lib/config.ts";
import { fetchFeed } from "../lib/feeds.ts";
import { isJapaneseSource, needsTranslation } from "../lib/urls.ts";
import { isDegraded, translateBatch } from "./engine.ts";
import { readStore, writeStore } from "./store.ts";

// --strict: any source feed failing to load exits non-zero (used by translate.yml).
const strict = process.argv.includes("--strict");

type TranslatableFeed = Awaited<ReturnType<typeof loadFeeds>>[number] & { id: string };

async function main() {
  const feeds: TranslatableFeed[] = (await loadFeeds()).filter(
    (f): f is TranslatableFeed =>
      f.enabled !== false && f.kind === "content" && !!f.id && needsTranslation(f.url),
  );
  const failed: string[] = [];

  for (const feed of feeds) {
    let entries: Awaited<ReturnType<typeof fetchFeed>>;
    try {
      entries = await fetchFeed(feed);
    } catch (err) {
      console.error(`[translate] skip ${feed.name}: ${(err as Error).message}`);
      failed.push(feed.name);
      continue;
    }

    const existing = await readStore(feed.id);
    const known = new Set(existing.map((e) => e.guid));
    const novel = entries.filter((e) => !known.has(e.guid));
    if (novel.length === 0) continue;

    // 記事単位でも日本語リンク(はてな等)は翻訳しない。translateBatch は空文字を素通しする。
    const forTranslation = (s: string, link: string) => (isJapaneseSource(link) ? "" : s);
    const titlesJa = await translateBatch(novel.map((e) => forTranslation(e.title, e.link)));
    const descsJa = await translateBatch(novel.map((e) => forTranslation(e.description, e.link)));
    const fresh = novel.map((e, i) => ({
      guid: e.guid,
      link: e.link,
      titleJa: titlesJa[i],
      descriptionJa: descsJa[i],
      pubDate: e.pubDate,
    }));

    const count = await writeStore(feed.id, feed.name, [...fresh, ...existing]);
    console.log(
      `[translate] ${feed.name}: +${fresh.length} → translated/${feed.id}.xml (${count})`,
    );
  }

  if (isDegraded()) {
    console.warn(
      "[translate] 翻訳エンジンが枠切れ／認証エラー — 一部エントリを未翻訳で公開しました",
    );
  }
  if (failed.length > 0 && strict) {
    console.error(`feeds failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
