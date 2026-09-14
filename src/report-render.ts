import { mkdir, readdir, rm } from "node:fs/promises";
import { Feed as FeedGen } from "feed";
import { marked } from "marked";
import { pageShell } from "./lib/html.ts";
import { DOMAIN_LABEL, domainArg } from "./lib/labels.ts";
import { SITE_URL, reportDir, reportMd, reportXml } from "./lib/paths.ts";
import { jstDateString } from "./lib/urls.ts";

const MAX_FEED_ITEMS = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}\.html$/;
/** 当日に見られなかった日を含めて遡れる日数。これより古い HTML は容量対策で消す。 */
const RETENTION_DAYS = 14;

/**
 * 保持期間より古いレポート HTML を削除する。フィード生成前に呼ぶので、
 * 残る XML のリンクは必ず実在する HTML を指す。
 * ファイル名は YYYY-MM-DD.html 固定なので、辞書順比較がそのまま日付比較になる。
 */
async function pruneOldReports(dir: string, today: string): Promise<void> {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (RETENTION_DAYS - 1));
  const cutoffFile = `${cutoff.toISOString().slice(0, 10)}.html`;

  const removed = (await readdir(dir)).filter((f) => DATE_RE.test(f) && f < cutoffFile);
  for (const file of removed) await rm(`${dir}/${file}`);
  if (removed.length > 0) {
    console.log(
      `pruned ${removed.length} report(s) older than ${cutoffFile}: ${removed.join(", ")}`,
    );
  }
}

async function main() {
  const domain = domainArg();
  const label = DOMAIN_LABEL[domain];
  const md = (
    await Bun.file(reportMd(domain))
      .text()
      .catch(() => "")
  ).trim();
  if (!md) throw new Error(`${reportMd(domain)} is empty — the Claude step produced nothing`);

  const date = jstDateString();
  const bodyHtml = await marked.parse(md);
  await mkdir(reportDir(domain), { recursive: true });
  await Bun.write(
    `${reportDir(domain)}/${date}.html`,
    pageShell({
      title: `${label} レポート ${date}`,
      body: `<h1>${label} レポート ${date}</h1>\n<article class="report">${bodyHtml}</article>`,
      depth: 2,
    }),
  );
  console.log(`wrote docs/report/${domain}/${date}.html`);
  await pruneOldReports(reportDir(domain), date);

  const files = (await readdir(reportDir(domain)))
    .filter((f) => DATE_RE.test(f))
    .sort()
    .reverse()
    .slice(0, MAX_FEED_ITEMS);

  const feed = new FeedGen({
    title: `${label} レポート — ogontaro/rss`,
    description: `${label} 系の新着から重要な記事を Claude が選定した日次レポート`,
    id: `${SITE_URL}/report-${domain}.xml`,
    link: `${SITE_URL}/`,
    language: "ja",
    copyright: "各記事の著作権は原著者に帰属します。",
    updated: new Date(),
  });

  for (const file of files) {
    const d = file.replace(".html", "");
    const html = await Bun.file(`${reportDir(domain)}/${file}`).text();
    const m = html.match(/<article class="report">([\s\S]*?)<\/article>/);
    feed.addItem({
      title: `${label} レポート ${d}`,
      id: `${SITE_URL}/report/${domain}/${file}`,
      link: `${SITE_URL}/report/${domain}/${file}`,
      date: new Date(`${d}T22:00:00Z`),
      content: m ? m[1] : html,
    });
  }

  await Bun.write(reportXml(domain), feed.rss2());
  console.log(`report-${domain}.xml: ${files.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
