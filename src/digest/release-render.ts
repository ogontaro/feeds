import { mkdir, readdir } from "node:fs/promises";
import { Feed as FeedGen } from "feed";
import { marked } from "marked";
import { recordAdoption } from "../lib/config.ts";
import { pageShell } from "../lib/html.ts";
import { DOMAIN_LABEL, domainArg } from "../lib/labels.ts";
import { SITE_URL, releaseDir, releaseInputJson, releaseMd, releaseXml } from "../lib/paths.ts";
import type { Domain } from "../lib/types.ts";
import { jstDateString } from "../lib/urls.ts";

// --refresh: ページ生成(Claude の md が必要)を飛ばし、既存 HTML からフィードだけ作り直す。
const refresh = process.argv.includes("--refresh");

const MAX_FEED_ITEMS = 26; // ~half a year of weekly reports
const DATE_RE = /^\d{4}-\d{2}-\d{2}\.html$/;

type ReleaseInputEntry = { link: string; project: string };

/** Which project names (= source.yaml feed names) actually got quoted in the digest. */
async function adoptedSourceNames(domain: Domain, md: string): Promise<string[]> {
  const entries: ReleaseInputEntry[] = await Bun.file(releaseInputJson(domain))
    .json()
    .catch(() => []);
  const adopted = entries.filter((e) => md.includes(e.link)).map((e) => e.project);
  return [...new Set(adopted)];
}

async function main() {
  const domain = domainArg();
  const label = DOMAIN_LABEL[domain];
  const dir = releaseDir(domain);

  let md = "";
  if (!refresh) {
    md = (
      await Bun.file(releaseMd(domain))
        .text()
        .catch(() => "")
    ).trim();
    if (!md) throw new Error(`${releaseMd(domain)} is empty — the Claude step produced nothing`);

    const date = jstDateString(); // the Monday the workflow runs
    const bodyHtml = await marked.parse(md);
    await mkdir(dir, { recursive: true });
    await Bun.write(
      `${dir}/${date}.html`,
      pageShell({
        title: `${label} リリースレポート ${date}`,
        body: `<h1>${label} リリースレポート ${date}</h1>\n<article class="report">${bodyHtml}</article>`,
        depth: 3,
      }),
    );
    console.log(`wrote docs/digest/release/${domain}/${date}.html`);
  }

  let files: string[];
  try {
    files = (await readdir(dir))
      .filter((f) => DATE_RE.test(f))
      .sort()
      .reverse()
      .slice(0, MAX_FEED_ITEMS);
  } catch {
    console.log(`${domain}: まだリリースページなし — フィード生成をスキップ`);
    return;
  }

  const feed = new FeedGen({
    title: `${label} リリースレポート — ogontaro/feeds`,
    description: `${label} 系ツールの週次リリースまとめ（Claude が注目リリースを選定）`,
    id: `${SITE_URL}/digest/release-${domain}.xml`,
    link: `${SITE_URL}/`,
    language: "ja",
    copyright: "各リリースノートの著作権は原著者に帰属します。",
    updated: new Date(),
  });

  for (const file of files) {
    const d = file.replace(".html", "");
    const html = await Bun.file(`${dir}/${file}`).text();
    const m = html.match(/<article class="report">([\s\S]*?)<\/article>/);
    feed.addItem({
      title: `${label} リリースレポート ${d}`,
      id: `${SITE_URL}/digest/release/${domain}/${file}`,
      link: `${SITE_URL}/digest/release/${domain}/${file}`,
      date: new Date(`${d}T22:30:00Z`),
      content: m ? m[1] : html,
    });
  }

  await Bun.write(releaseXml(domain), feed.rss2());
  console.log(`release-${domain}.xml: ${files.length} items`);

  if (!refresh && md) {
    const adopted = await adoptedSourceNames(domain, md);
    await recordAdoption(domain, adopted);
    console.log(`adoption-log.ndjson: recorded ${adopted.length} source(s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
