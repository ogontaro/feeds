import Parser from "rss-parser";
import type { Entry, Feed } from "./types.ts";

export const parser = new Parser({
  timeout: 20_000,
  headers: { "User-Agent": "ogontaro-feeds/1.0 (+https://ogontaro.github.io/feeds)" },
});

/**
 * 1 フィードから取り込む最大件数。日次 24h / 週次 7d の窓に対して十分な量。
 * アグリゲータ（HN 検索・日次ダイジェスト）や全履歴を返す終わりのないフィードでも、
 * 初回取り込みが Claude のプロンプトを膨らませないようにする上限。
 */
const MAX_ENTRIES_PER_FEED = 20;

/** HTML をテキストにする。改行は残す(リリースノート・レポート本文向け)。 */
export function toText(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** HTML を 1 行のテキストにする(タイトル・概要向け)。 */
const toLine = (s: string): string => toText(s).replace(/\s+/g, " ");

/**
 * hnrss 等は GitHub Actions から断続的に 502 を返し、1 件でも落ちると
 * ワークフローが失敗する。hnrss は検索結果の生成に 30 秒前後かかり、生成後はキャッシュから即返るため、
 * 5xx とタイムアウトだけ生成完了を待てる間隔を空けて再試行する（4xx・パースエラーは即失敗のまま）。
 */
async function parseWithRetry(url: string): Promise<Awaited<ReturnType<typeof parser.parseURL>>> {
  for (const waitMs of [30_000, 60_000]) {
    try {
      return await parser.parseURL(url);
    } catch (err) {
      if (!/Status code 5\d\d|timed out/.test((err as Error).message)) throw err;
      await Bun.sleep(waitMs);
    }
  }
  return parser.parseURL(url);
}

/**
 * Google News 検索 RSS のリンク(news.google.com/rss/articles/<id>)を元記事 URL に解決する。
 * そのままでは Google 翻訳 URL 経由で開けないため、レポートに渡す前に解決する。記事ページの署名を使って内部 API を引く
 * 非公開の手順なので、失敗したら元のリンクを返してパイプラインは止めない。
 */
export async function resolveGoogleNewsLink(link: string): Promise<string> {
  const m = link.match(/^https:\/\/news\.google\.com\/rss\/articles\/([^?]+)/);
  if (!m) return link;
  const id = m[1];
  try {
    const page = await (await fetch(`https://news.google.com/rss/articles/${id}`)).text();
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return link;
    const req = JSON.stringify([
      "garturlreq",
      [
        [
          "X",
          "X",
          ["X", "X"],
          null,
          null,
          1,
          1,
          "US:en",
          null,
          1,
          null,
          null,
          null,
          null,
          null,
          0,
          1,
        ],
        "X",
        "X",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0,
      ],
      id,
      Number(ts),
      sg,
    ]);
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", req, null, "generic"]]]))}`,
    });
    const url = (await res.text()).match(/\\"garturlres\\",\\"(.*?)\\"/)?.[1];
    return url?.startsWith("http") ? url : link;
  } catch {
    return link;
  }
}

/** Fetch one source feed and normalize its items. Network/parse errors propagate. */
export async function fetchFeed(feed: Feed): Promise<Entry[]> {
  const parsed = await parseWithRetry(feed.url);
  const entries: Entry[] = [];
  for (const item of parsed.items) {
    const link = (item.link ?? "").trim();
    if (!link) continue;
    const rawDesc = item.contentSnippet ?? item.summary ?? item.content ?? "";
    entries.push({
      link,
      title: toLine(item.title ?? "(untitled)").slice(0, 300),
      description: toLine(rawDesc).slice(0, 500),
      pubDate: item.isoDate ? new Date(item.isoDate) : new Date(),
      source: feed.name,
    });
  }
  // 新しい順に揃えてから上限を適用する。全履歴を昇順で返すミラー系フィードでも、
  // 古い記事を掴んで新しい記事を取りこぼさない。
  return entries
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, MAX_ENTRIES_PER_FEED);
}
