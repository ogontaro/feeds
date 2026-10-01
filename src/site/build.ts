import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { RELEASE_DOMAINS, REPORT_DOMAINS } from "../lib/config.ts";
import { listPages } from "../lib/digest.ts";
import { escapeHtml, pageShell } from "../lib/html.ts";
import { DOMAIN_CATEGORY, DOMAIN_LABEL } from "../lib/labels.ts";
import { ASSETS_DIR, DIGEST_OPML, DOCS, INDEX_HTML, SITE_URL } from "../lib/paths.ts";
import { STYLE_CSS } from "../lib/style.ts";
import type { Domain } from "../lib/types.ts";
import { writeLandscapePage } from "./landscape.ts";

/** UTF-8 BOM。charset なしで配信される .opml のブラウザ表示化け対策に付ける。 */
const UTF8_BOM = "﻿";

/**
 * 過去一覧ページ(`<dir>/index.html`)を書き、トップ用のリンク行(最新・過去一覧・購読)を返す。
 * dir と xml は docs/ からの相対パス。
 */
async function digestLinks(dir: string, xml: string, title: string): Promise<string> {
  const pages = await listPages(`${DOCS}/${dir}`);
  const lines = ["<li>最新: まだありません</li>"];
  if (pages.length > 0) {
    const items = pages.map((p) => `<li><a href="${p}.html">${p}</a></li>`).join("\n");
    await Bun.write(
      `${DOCS}/${dir}/index.html`,
      pageShell({
        title,
        body: `<h1>${title}</h1>\n<ul>\n${items}\n</ul>`,
        depth: dir.split("/").length,
      }),
    );
    lines[0] = `<li>最新: <a href="${dir}/${pages[0]}.html">${pages[0]}</a></li>`;
    lines.push(`<li><a href="${dir}/">過去の一覧（${pages.length} 本）</a></li>`);
  }
  // 実在するフィードだけ載せる(初回 CI 実行前など)
  if (existsSync(`${DOCS}/${xml}`)) {
    lines.push(`<li>購読: <a href="${xml}">${basename(xml)}</a></li>`);
  }
  return `<ul>\n${lines.join("\n")}\n</ul>`;
}

/** ドメインごとのカード。 */
async function cards(
  kind: "report" | "release",
  kindLabel: string,
  domains: Domain[],
): Promise<string> {
  const sections = [];
  for (const d of domains) {
    const links = await digestLinks(
      `digest/${kind}/${d}`,
      `digest/${kind}-${d}.xml`,
      `${DOMAIN_LABEL[d]} ${kindLabel} 過去の一覧`,
    );
    sections.push(
      `<section class="card">\n<h3>${escapeHtml(DOMAIN_LABEL[d])} <span class="muted">${escapeHtml(DOMAIN_CATEGORY[d])}</span></h3>\n${links}\n</section>`,
    );
  }
  return `<div class="cards">\n${sections.join("\n")}\n</div>`;
}

/** フォルダ → [表示名, docs/ からの相対パス] の購読リスト。実在するフィードだけ載せる。 */
function opml(folders: [string, [string, string][]][]): string {
  const outlines = folders
    .map(
      ([folder, feeds]) =>
        [folder, feeds.filter(([, xml]) => existsSync(`${DOCS}/${xml}`))] as const,
    )
    .filter(([, feeds]) => feeds.length > 0)
    .map(([folder, feeds]) => {
      const children = feeds
        .map(
          ([label, xml]) =>
            `      <outline type="rss" text="${escapeHtml(label)}" title="${escapeHtml(label)}" xmlUrl="${SITE_URL}/${xml}"/>`,
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

async function main() {
  await mkdir(ASSETS_DIR, { recursive: true });
  await Bun.write(`${ASSETS_DIR}/style.css`, STYLE_CSS);

  const body = `<h1>ogontaro / rss</h1>
<p>まとめて購読: <a href="opml/digest.opml">digest.opml</a></p>
<h2>日次レポート</h2>
<p class="muted">新着と X タイムラインから Claude が見る価値のある記事だけ(最大 5 本)を選んでコメントを付けたダイジェスト。毎日 07:00 JST。海外記事は原文・Google 翻訳リンク付き。</p>
${await cards("report", "日次レポート", REPORT_DOMAINS)}
<h2>週次リリース</h2>
<p class="muted">使っているツールの過去1週間の GitHub releases を Claude が整理(破壊的変更を先頭)。毎週月 07:30 JST。</p>
${await cards("release", "週次リリース", RELEASE_DOMAINS)}
<h2>月次トレンド</h2>
<p class="muted">業界全体の潮流(新しい概念・呼称の出現と定着)を前月のレポートと外部調査から Claude が三角測量で判定し、前月からの変化とあわせてまとめる。毎月2日 07:45 JST。</p>
${await digestLinks("digest/trend", "digest/trend.xml", "月次トレンドレポート 過去の一覧")}
<h2>技術ランドスケープ</h2>
<p class="muted">業界の全体像を領域ごとの表にし、自分の興味（interests.yaml で管理）を強調して示す。項目ごとに詳細ページがある。月次トレンドのたびに更新し、各レポートの参考資料にもしている。</p>
${(await writeLandscapePage()) ? `<p><a href="digest/landscape.html">技術ランドスケープを見る</a></p>` : "<p>まだありません</p>"}`;
  await Bun.write(INDEX_HTML, pageShell({ title: "ogontaro / rss", body }));

  await mkdir(dirname(DIGEST_OPML), { recursive: true });
  await Bun.write(
    DIGEST_OPML,
    UTF8_BOM +
      opml([
        [
          "日次レポート",
          REPORT_DOMAINS.map((d) => [`${DOMAIN_LABEL[d]} 日次レポート`, `digest/report-${d}.xml`]),
        ],
        [
          "週次リリース",
          RELEASE_DOMAINS.map((d) => [`${DOMAIN_LABEL[d]} リリース`, `digest/release-${d}.xml`]),
        ],
        ["月次トレンド", [["月次トレンド", "digest/trend.xml"]]],
      ]),
  );
  console.log("site: index.html + opml/digest.opml");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
