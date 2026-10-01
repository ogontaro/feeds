import { appendFile, mkdir, readdir } from "node:fs/promises";
import { relative } from "node:path";
import { Feed as FeedGen } from "feed";
import { articleBody, digestArticle, pageShell } from "./html.ts";
import { ADOPTION_LOG, DOCS, SITE_URL } from "./paths.ts";
import type { Domain } from "./types.ts";

/** レポートのページ名。日次・週次は YYYY-MM-DD、月次は YYYY-MM。 */
const PAGE_RE = /^\d{4}-\d{2}(-\d{2})?\.html$/;

/** Local calendar date in JST (the report is generated at 07:00 JST). */
export function jstDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** dir にあるレポートのページ名(拡張子なし)を新しい順に返す。dir が無ければ空。 */
export async function listPages(dir: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => []);
  return files
    .filter((f) => PAGE_RE.test(f))
    .map((f) => f.replace(".html", ""))
    .sort()
    .reverse();
}

/** Claude ステップが書いた Markdown。空なら後続を止める。 */
export async function readClaudeOutput(path: string): Promise<string> {
  const md = (
    await Bun.file(path)
      .text()
      .catch(() => "")
  ).trim();
  if (!md) throw new Error(`${path} is empty — the Claude step produced nothing`);
  return md;
}

/** Markdown を `<dir>/<page>.html` に書き出す。見出しは `<name> <page>`。 */
export async function writePage(dir: string, page: string, name: string, md: string) {
  const rel = relative(DOCS, dir);
  const title = `${name} ${page}`;
  await mkdir(dir, { recursive: true });
  await Bun.write(
    `${dir}/${page}.html`,
    pageShell({
      title,
      body: `<h1>${title}</h1>\n${await digestArticle(md)}`,
      depth: rel.split("/").length,
    }),
  );
  console.log(`wrote docs/${rel}/${page}.html`);
}

/** dir に残っているページから RSS を作り直す(新しい順に max 件)。ページが無ければ何もしない。 */
export async function writeFeed(opts: {
  dir: string;
  xml: string;
  name: string;
  description: string;
  copyright: string;
  max: number;
  /** ページ名(YYYY-MM-DD / YYYY-MM)から公開時刻を決める。 */
  date: (page: string) => Date;
}) {
  const pages = (await listPages(opts.dir)).slice(0, opts.max);
  const xmlRel = relative(DOCS, opts.xml);
  if (pages.length === 0) {
    console.log(`${xmlRel}: まだページなし — フィード生成をスキップ`);
    return;
  }
  const feed = new FeedGen({
    title: `${opts.name} — ogontaro/feeds`,
    description: opts.description,
    id: `${SITE_URL}/${xmlRel}`,
    link: `${SITE_URL}/`,
    language: "ja",
    copyright: opts.copyright,
    updated: new Date(),
  });
  for (const page of pages) {
    const url = `${SITE_URL}/${relative(DOCS, opts.dir)}/${page}.html`;
    feed.addItem({
      title: `${opts.name} ${page}`,
      id: url,
      link: url,
      date: opts.date(page),
      content: articleBody(await Bun.file(`${opts.dir}/${page}.html`).text()),
    });
  }
  await Bun.write(opts.xml, feed.rss2());
  console.log(`${xmlRel}: ${pages.length} items`);
}

/**
 * 入力(collect の JSON)のうち、Claude の Markdown にリンクが引用されたフィードを採用実績として追記する。
 * フィード監査が「読まれていないフィード」の判定に使う。
 */
export async function recordAdoption(
  domain: Domain,
  inputJson: string,
  md: string,
  nameKey: "source" | "project",
) {
  const entries: Record<string, string>[] = await Bun.file(inputJson)
    .json()
    .catch(() => []);
  const adopted = new Set(entries.filter((e) => md.includes(e.link)).map((e) => e[nameKey]));
  const date = new Date().toISOString().slice(0, 10);
  const lines = [...adopted].map(
    (sourceName) => `${JSON.stringify({ date, domain, sourceName })}\n`,
  );
  if (lines.length > 0) await appendFile(ADOPTION_LOG, lines.join(""));
  console.log(`adoption-log.ndjson: recorded ${lines.length} source(s)`);
}
