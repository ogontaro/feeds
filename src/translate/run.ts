import { loadFeeds } from "../lib/config.ts";
import { fetchFeed, resolveGoogleNewsLink } from "../lib/feeds.ts";
import { isJapaneseSource, needsTranslation } from "../lib/urls.ts";
import { canTranslate, isDegraded, translateBatch } from "./engine.ts";
import { readStore, writeStore } from "./store.ts";

// --strict: any source feed failing to load exits non-zero (used by translate.yml).
const strict = process.argv.includes("--strict");

type TranslatableFeed = Awaited<ReturnType<typeof loadFeeds>>[number] & { id: string };
type Stored = Awaited<ReturnType<typeof readStore>>[number];

const HAS_JA = /[\u3040-\u30ff\u4e00-\u9fff]/;
const REPAIR_WINDOW_MS = 7 * 86_400_000;
const REPAIR_MAX_PER_FEED = 10;

/**
 * 翻訳枠切れで未翻訳のまま公開した直近の記事と、未解決の Google News リンクを直す。
 * 解決・翻訳できないものを毎回試し続けないよう直近 7 日に限り、再翻訳は 1 フィード 10 件までにする。
 * 製品名だけのタイトルは訳しても英語のままなので、タイトルと概要の両方に日本語が無いものだけ訳し直す。
 */
async function repair(existing: Stored[]): Promise<boolean> {
  const cutoff = Date.now() - REPAIR_WINDOW_MS;
  const recent = existing.filter((e) => e.pubDate.getTime() >= cutoff);
  let changed = false;
  for (const e of recent.filter((x) => x.link.startsWith("https://news.google.com/"))) {
    const link = await resolveGoogleNewsLink(e.link);
    if (link !== e.link) {
      e.link = link;
      changed = true;
    }
  }
  if (!canTranslate()) return changed;
  const stale = recent
    .filter((e) => !isJapaneseSource(e.link) && !HAS_JA.test(e.titleJa + e.descriptionJa))
    .slice(0, REPAIR_MAX_PER_FEED);
  if (stale.length === 0) return changed;
  const titles = await translateBatch(stale.map((e) => e.titleJa));
  const descs = await translateBatch(stale.map((e) => e.descriptionJa));
  stale.forEach((e, i) => {
    if (titles[i] !== e.titleJa || descs[i] !== e.descriptionJa) changed = true;
    e.titleJa = titles[i];
    e.descriptionJa = descs[i];
  });
  return changed;
}

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
    for (const e of novel) e.link = await resolveGoogleNewsLink(e.link);

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

    // 新着の翻訳を優先し、残った枠で過去分を直す。
    const repaired = await repair(existing);
    if (fresh.length === 0 && !repaired) continue;
    const count = await writeStore(feed.id, feed.name, [...fresh, ...existing]);
    console.log(
      `[translate] ${feed.name}: +${fresh.length}${repaired ? " (repaired)" : ""} → translated/${feed.id}.xml (${count})`,
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
