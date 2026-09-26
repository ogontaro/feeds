import { mkdir, readdir } from "node:fs/promises";
import { CONTENT_DOMAINS, RELEASE_DOMAINS, loadFeeds } from "../lib/config.ts";
import { pageShell } from "../lib/html.ts";
import { DOMAIN_CATEGORY, DOMAIN_LABEL } from "../lib/labels.ts";
import {
  ASSETS_DIR,
  DIGEST_DIR,
  DIGEST_OPML,
  DOCS,
  INDEX_HTML,
  OPML_DIR,
  SITE_URL,
  TRANSLATED_DIR,
  TRANSLATED_OPML,
  releaseDir,
  reportDir,
} from "../lib/paths.ts";
import { STYLE_CSS } from "../lib/style.ts";
import type { Domain } from "../lib/types.ts";
import { UTF8_BOM, escapeHtml } from "../lib/urls.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}\.html$/;

async function listDates(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((f) => DATE_RE.test(f))
      .map((f) => f.replace(".html", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** DOMAIN_CATEGORY の出現順でグループ化する。 */
function groupByCategory<T>(items: T[], catOf: (t: T) => string): [string, T[]][] {
  const groups: [string, T[]][] = [];
  for (const item of items) {
    const cat = catOf(item);
    const found = groups.find(([c]) => c === cat);
    if (found) found[1].push(item);
    else groups.push([cat, [item]]);
  }
  return groups;
}

/** 日付 HTML を過去一覧ページとして書き出す(digest/report|release/<domain>/index.html)。 */
async function writeArchive(kind: "report" | "release", d: Domain): Promise<void> {
  const dir = kind === "report" ? reportDir(d) : releaseDir(d);
  const dates = await listDates(dir);
  if (dates.length === 0) return;
  const kindLabel = kind === "report" ? "日次レポート" : "週次リリース";
  const title = `${DOMAIN_LABEL[d]} ${kindLabel} 過去の一覧`;
  const items = dates.map((r) => `<li><a href="${r}.html">${r}</a></li>`).join("\n");
  const body = `<h1>${title}</h1>\n<ul>\n${items}\n</ul>`;
  await Bun.write(`${dir}/index.html`, pageShell({ title, body, depth: 3 }));
}

/** サービスA: ドメインカード(最新1本 + 過去一覧 + 購読リンク)。 */
async function digestCard(d: Domain, kind: "report" | "release"): Promise<string> {
  const dir = kind === "report" ? reportDir(d) : releaseDir(d);
  const dates = await listDates(dir);
  const latest = dates[0];
  const lines = [
    `<li>最新: ${
      latest
        ? `<a href="${DIGEST_URL_PREFIX}/${kind}/${d}/${latest}.html">${latest}</a>`
        : "まだありません"
    }</li>`,
  ];
  if (dates.length > 0) {
    lines.push(
      `<li><a href="${DIGEST_URL_PREFIX}/${kind}/${d}/">過去の一覧（${dates.length} 本）</a></li>`,
    );
  }
  const xml = `${kind}-${d}.xml`;
  if (await Bun.file(`${DIGEST_DIR}/${xml}`).exists()) {
    lines.push(`<li>購読: <a href="${DIGEST_URL_PREFIX}/${xml}">${xml}</a></li>`);
  }
  return `<section class="card">\n<h3>${escapeHtml(DOMAIN_LABEL[d])} <span class="muted">${escapeHtml(DOMAIN_CATEGORY[d])}</span></h3>\n<ul>\n${lines.join("\n")}\n</ul>\n</section>`;
}

const DIGEST_URL_PREFIX = "digest";

function opmlBody(entries: [string, [string, string][]][]): string {
  const outlines = entries
    .map(([folder, items]) => {
      const children = items
        .map(
          ([label, file]) =>
            `      <outline type="rss" text="${escapeHtml(label)}" title="${escapeHtml(label)}" xmlUrl="${SITE_URL}/${file}"/>`,
        )
        .join("\n");
      return `    <outline text="${escapeHtml(folder)}" title="${escapeHtml(folder)}">\n${children}\n    </outline>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>ogontaro / rss</title></head>
  <body>
${outlines}
  </body>
</opml>
`;
}

/** 実在するファイルのみ購読リストに載せる(初回 CI 実行前など)。 */
async function existingFiles(names: [string, string][]): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for (const [label, file] of names) {
    if (await Bun.file(`${DOCS}/${file}`).exists()) out.push([label, file]);
  }
  return out;
}

async function main() {
  await mkdir(ASSETS_DIR, { recursive: true });
  await mkdir(OPML_DIR, { recursive: true });
  await Bun.write(`${ASSETS_DIR}/style.css`, STYLE_CSS);

  const feeds = await loadFeeds();
  const translated = feeds.filter((f) => f.kind === "content" && f.id);

  // --- サービスB: translated/ サイト別フィード + 一覧ページ ---
  await mkdir(TRANSLATED_DIR, { recursive: true });
  const translatedGroups = groupByCategory(translated, (f) => DOMAIN_CATEGORY[f.domain]);
  const siteRows = translatedGroups
    .map(([cat, items]) => {
      const lis = items
        .map(
          (f) =>
            `<li><a href="${f.id}.xml">${escapeHtml(f.name)}</a> <span class="muted">translated/${f.id}.xml</span></li>`,
        )
        .join("\n");
      return `<h2>${escapeHtml(cat)}</h2>\n<ul>\n${lis}\n</ul>`;
    })
    .join("\n");
  const translatedBody = `<h1>翻訳フィード</h1>
<p>海外サイトの新着をタイトル・概要だけ日本語化した全量ストリーム。6時間ごと更新。記事の選定やコメントは付きません。全文を読むときは各エントリの Google 翻訳リンクから。</p>
<p>まとめて購読: <a href="../opml/translated.opml">translated.opml</a></p>
${siteRows}`;
  await Bun.write(
    `${TRANSLATED_DIR}/index.html`,
    pageShell({ title: "翻訳フィード", body: translatedBody, depth: 1 }),
  );
  // B の OPML: 実ファイルが存在するサイトのみ(初回 translate 実行前は空になる)。
  const translatedFolders: [string, [string, string][]][] = [];
  for (const [cat, items] of translatedGroups) {
    const files = await existingFiles(
      items.map((f) => [f.name, `translated/${f.id}.xml`] as [string, string]),
    );
    if (files.length > 0) translatedFolders.push([cat, files]);
  }
  await Bun.write(TRANSLATED_OPML, UTF8_BOM + opmlBody(translatedFolders));

  // --- サービスA: digest(レポート+リリース) ---
  for (const d of CONTENT_DOMAINS) await writeArchive("report", d);
  for (const d of RELEASE_DOMAINS) await writeArchive("release", d);

  const reportCards = (await Promise.all(CONTENT_DOMAINS.map((d) => digestCard(d, "report")))).join(
    "\n",
  );
  const releaseCards = (
    await Promise.all(RELEASE_DOMAINS.map((d) => digestCard(d, "release")))
  ).join("\n");
  const body = `<h1>ogontaro / rss</h1>
<p>ダイジェスト(読む)と<a href="translated/">翻訳フィード(拾い読み)</a>の2サービス構成。まとめて購読: <a href="opml/digest.opml">digest.opml</a> / <a href="opml/translated.opml">translated.opml</a></p>
<h2>日次レポート</h2>
<p class="muted">新着から Claude が重要記事を 5〜10 本選んでコメントを付けたダイジェスト。毎日 07:00 JST。海外記事は原文・Google 翻訳リンク付き。</p>
<div class="cards">
${reportCards}
</div>
<h2>週次リリース</h2>
<p class="muted">使っているツールの過去1週間の GitHub releases を Claude が整理(破壊的変更を先頭)。毎週月 07:30 JST。</p>
<div class="cards">
${releaseCards}
</div>`;
  await Bun.write(INDEX_HTML, pageShell({ title: "ogontaro / rss", body }));

  const digestFolders: [string, [string, string][]][] = [];
  const reportFiles = await existingFiles(
    CONTENT_DOMAINS.map(
      (d) =>
        [`${DOMAIN_LABEL[d]} 日次レポート`, `${DIGEST_URL_PREFIX}/report-${d}.xml`] as [
          string,
          string,
        ],
    ),
  );
  if (reportFiles.length > 0) digestFolders.push(["日次レポート", reportFiles]);
  const releaseFiles = await existingFiles(
    RELEASE_DOMAINS.map(
      (d) =>
        [`${DOMAIN_LABEL[d]} リリース`, `${DIGEST_URL_PREFIX}/release-${d}.xml`] as [
          string,
          string,
        ],
    ),
  );
  if (releaseFiles.length > 0) digestFolders.push(["週次リリース", releaseFiles]);
  await Bun.write(DIGEST_OPML, UTF8_BOM + opmlBody(digestFolders));

  console.log(
    `site: index.html + translated/ (${translated.length}) + opml/ (digest ${reportFiles.length + releaseFiles.length})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
