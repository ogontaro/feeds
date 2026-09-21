import { Feed as FeedGen } from "feed";
import Parser from "rss-parser";
import { SITE_URL, translatedFile } from "../lib/paths.ts";
import type { TranslatedEntry } from "../lib/types.ts";
import { escapeHtml, googleTranslateUrl, isJapaneseSource } from "../lib/urls.ts";

const MAX_ITEMS = 100;
const parser = new Parser();

/** 公開済み翻訳フィード(translated/<id>.xml)の読み戻し。guid 重複判定用の蓄積も兼ねる。 */
export async function readStore(id: string): Promise<TranslatedEntry[]> {
  const file = Bun.file(translatedFile(id));
  if (!(await file.exists())) return [];
  const parsed = await parser.parseString(await file.text());
  return parsed.items.map((item) => ({
    guid: (item.guid ?? item.link ?? "").trim(),
    link: (item.link ?? "").trim(),
    titleJa: (item.title ?? "").trim(),
    descriptionJa: (item.contentSnippet ?? item.summary ?? "").trim(),
    pubDate: item.isoDate ? new Date(item.isoDate) : new Date(),
  }));
}

/** 1サイト=1フィードとして書き出す。リンク先は原文+海外記事には Google 翻訳 URL のみ(選定・コメントなし)。 */
export async function writeStore(
  id: string,
  name: string,
  entries: TranslatedEntry[],
): Promise<number> {
  const byGuid = new Map<string, TranslatedEntry>();
  for (const e of entries) if (e.guid && !byGuid.has(e.guid)) byGuid.set(e.guid, e);
  const items = [...byGuid.values()]
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, MAX_ITEMS);

  const feed = new FeedGen({
    title: `${name} — 翻訳`,
    description: `${name} の新着エントリのタイトルと概要を日本語化したもの。全文は翻訳URLから。`,
    id: `${SITE_URL}/translated/${id}.xml`,
    link: `${SITE_URL}/translated/`,
    language: "ja",
    copyright: "各記事の著作権は原著者に帰属します。翻訳は機械翻訳です。",
    updated: items[0]?.pubDate ?? new Date(),
  });

  for (const e of items) {
    feed.addItem({
      title: e.titleJa,
      id: e.guid,
      link: e.link,
      date: e.pubDate,
      description: e.descriptionJa || undefined,
      content: isJapaneseSource(e.link)
        ? `<p><a href="${escapeHtml(e.link)}">原文を読む</a></p>`
        : `<p><a href="${escapeHtml(e.link)}">原文を読む</a> / ` +
          `<a href="${escapeHtml(googleTranslateUrl(e.link))}">Google 翻訳で全文を読む</a></p>`,
    });
  }

  await Bun.write(translatedFile(id), feed.rss2());
  return items.length;
}
