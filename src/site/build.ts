import { mkdir, readdir } from "node:fs/promises";
import { RELEASE_DOMAINS, REPORT_DOMAINS, loadFeeds } from "../lib/config.ts";
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
  TREND_DIR,
  TREND_XML,
  releaseDir,
  reportDir,
} from "../lib/paths.ts";
import { STYLE_CSS } from "../lib/style.ts";
import type { Domain } from "../lib/types.ts";
import { UTF8_BOM, escapeHtml } from "../lib/urls.ts";
import { writeLandscapePage } from "./landscape.ts";

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

/** 月次トレンド(ドメイン横断の1本): 過去一覧ページを書き、トップ用のリストを返す。 */
async function trendSection(): Promise<string> {
  const months = (await readdir(TREND_DIR).catch(() => []))
    .filter((f) => /^\d{4}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(".html", ""))
    .sort()
    .reverse();
  if (months.length === 0) return "<p>まだありません</p>";
  const title = "月次トレンドレポート 過去の一覧";
  const items = months.map((m) => `<li><a href="${m}.html">${m}</a></li>`).join("\n");
  await Bun.write(
    `${TREND_DIR}/index.html`,
    pageShell({ title, body: `<h1>${title}</h1>\n<ul>\n${items}\n</ul>`, depth: 2 }),
  );
  const lines = [
    `<li>最新: <a href="${DIGEST_URL_PREFIX}/trend/${months[0]}.html">${months[0]}</a></li>`,
    `<li><a href="${DIGEST_URL_PREFIX}/trend/">過去の一覧（${months.length} 本）</a></li>`,
  ];
  if (await Bun.file(TREND_XML).exists()) {
    lines.push(`<li>購読: <a href="${DIGEST_URL_PREFIX}/trend.xml">trend.xml</a></li>`);
  }
  return `<ul>\n${lines.join("\n")}\n</ul>`;
}

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
  for (const d of REPORT_DOMAINS) await writeArchive("report", d);
  for (const d of RELEASE_DOMAINS) await writeArchive("release", d);

  const reportCards = (await Promise.all(REPORT_DOMAINS.map((d) => digestCard(d, "report")))).join(
    "\n",
  );
  const releaseCards = (
    await Promise.all(RELEASE_DOMAINS.map((d) => digestCard(d, "release")))
  ).join("\n");
  const body = `<h1>ogontaro / rss</h1>
<p>ダイジェスト(読む)と<a href="translated/">翻訳フィード(拾い読み)</a>の2サービス構成。まとめて購読: <a href="opml/digest.opml">digest.opml</a> / <a href="opml/translated.opml">translated.opml</a></p>
<h2>日次レポート</h2>
<p class="muted">新着と X タイムラインから Claude が見る価値のある記事だけ(最大 5 本)を選んでコメントを付けたダイジェスト。毎日 07:00 JST。海外記事は原文・Google 翻訳リンク付き。</p>
<div class="cards">
${reportCards}
</div>
<h2>週次リリース</h2>
<p class="muted">使っているツールの過去1週間の GitHub releases を Claude が整理(破壊的変更を先頭)。毎週月 07:30 JST。</p>
<div class="cards">
${releaseCards}
</div>
<h2>月次トレンド</h2>
<p class="muted">業界全体の潮流(新しい概念・呼称の出現と定着)を前月のレポートと外部調査から Claude が三角測量で判定し、前月からの変化とあわせてまとめる。毎月2日 07:45 JST。</p>
${await trendSection()}
<h2>技術ランドスケープ</h2>
<p class="muted">業界の全体像を領域ごとの表にし、自分の興味（interests.yaml で管理）を強調して示す。項目ごとに詳細ページがある。月次トレンドのたびに更新し、各レポートの参考資料にもしている。</p>
${(await writeLandscapePage()) ? `<p><a href="${DIGEST_URL_PREFIX}/landscape.html">技術ランドスケープを見る</a></p>` : "<p>まだありません</p>"}`;
  await Bun.write(INDEX_HTML, pageShell({ title: "ogontaro / rss", body }));

  const digestFolders: [string, [string, string][]][] = [];
  const reportFiles = await existingFiles(
    REPORT_DOMAINS.map(
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
  const trendFiles = await existingFiles([["月次トレンド", `${DIGEST_URL_PREFIX}/trend.xml`]]);
  if (trendFiles.length > 0) digestFolders.push(["月次トレンド", trendFiles]);
  await Bun.write(DIGEST_OPML, UTF8_BOM + opmlBody(digestFolders));

  console.log(
    `site: index.html + translated/ (${translated.length}) + opml/ (digest ${reportFiles.length + releaseFiles.length + trendFiles.length})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
