import { mkdir, readdir } from "node:fs/promises";
import { Feed as FeedGen } from "feed";
import { digestArticle, pageShell } from "../lib/html.ts";
import { SITE_URL, TREND_DIR, TREND_INPUT_MD, TREND_MD, TREND_XML } from "../lib/paths.ts";

const MAX_FEED_ITEMS = 24; // 2 年分
const MONTH_FILE_RE = /^\d{4}-\d{2}\.html$/;

async function main() {
  const month = (await Bun.file(TREND_INPUT_MD).text()).match(/^# 対象月: (\d{4}-\d{2})/)?.[1];
  if (!month) throw new Error(`${TREND_INPUT_MD} has no 対象月 header`);
  const md = (
    await Bun.file(TREND_MD)
      .text()
      .catch(() => "")
  ).trim();
  if (!md) throw new Error(`${TREND_MD} is empty — the Claude step produced nothing`);

  const title = `月次トレンドレポート ${month}`;
  await mkdir(TREND_DIR, { recursive: true });
  await Bun.write(
    `${TREND_DIR}/${month}.html`,
    pageShell({ title, body: `<h1>${title}</h1>\n${await digestArticle(md)}`, depth: 2 }),
  );
  console.log(`wrote docs/digest/trend/${month}.html`);

  const files = (await readdir(TREND_DIR))
    .filter((f) => MONTH_FILE_RE.test(f))
    .sort()
    .reverse()
    .slice(0, MAX_FEED_ITEMS);
  const feed = new FeedGen({
    title: "月次トレンドレポート — ogontaro/feeds",
    description: "業界全体の潮流(新しい概念・呼称の出現と定着)を月次で追うレポート",
    id: `${SITE_URL}/digest/trend.xml`,
    link: `${SITE_URL}/`,
    language: "ja",
    copyright: "引用元記事の著作権は原著者に帰属します。",
    updated: new Date(),
  });
  for (const file of files) {
    const m = file.replace(".html", "");
    const [y, mo] = m.split("-").map(Number);
    const html = await Bun.file(`${TREND_DIR}/${file}`).text();
    const art = html.match(/<article class="report">([\s\S]*?)<\/article>/);
    feed.addItem({
      title: `月次トレンドレポート ${m}`,
      id: `${SITE_URL}/digest/trend/${file}`,
      link: `${SITE_URL}/digest/trend/${file}`,
      date: new Date(Date.UTC(y, mo, 1, 22, 45)), // 翌月2日 07:45 JST の公開時刻
      content: art ? art[1] : html,
    });
  }
  await Bun.write(TREND_XML, feed.rss2());
  console.log(`trend.xml: ${files.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
