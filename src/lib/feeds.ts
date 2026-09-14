import Parser from "rss-parser";
import type { Feed, SourceEntry } from "./types.ts";

const parser = new Parser({
  timeout: 20_000,
  headers: { "User-Agent": "ogontaro-rss/1.0 (+https://ogontaro.github.io/rss)" },
});

/**
 * 1 フィードから取り込む最大件数。日次 24h / 週次 7d の窓に対して十分な量。
 * アグリゲータ（HN 検索・日次ダイジェスト）や全履歴を返す終わりのないフィードでも、
 * 初回取り込みが翻訳枠と DeepL の 1 リクエスト 50 件制限を超えないようにする上限。
 */
const MAX_ENTRIES_PER_FEED = 20;

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch one source feed and normalize its items. Network/parse errors propagate. */
export async function fetchFeed(feed: Feed): Promise<SourceEntry[]> {
  const parsed = await parser.parseURL(feed.url);
  const entries: SourceEntry[] = [];
  for (const item of parsed.items) {
    const link = (item.link ?? "").trim();
    const guid = (item.guid ?? link).trim();
    if (!guid || !link) continue;
    const rawDesc = item.contentSnippet ?? item.summary ?? item.content ?? "";
    entries.push({
      guid,
      link,
      title: stripHtml(item.title ?? "(untitled)").slice(0, 300),
      description: stripHtml(rawDesc).slice(0, 500),
      pubDate: item.isoDate ? new Date(item.isoDate) : new Date(),
      sourceName: feed.name,
    });
  }
  // 新しい順に揃えてから上限を適用する。全履歴を昇順で返すミラー系フィードでも、
  // 古い記事を掴んで新しい記事を取りこぼさない。
  return entries
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, MAX_ENTRIES_PER_FEED);
}
