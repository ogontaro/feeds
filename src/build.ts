import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_DOMAINS, RELEASE_DOMAINS } from "./lib/config.ts";
import { pageShell } from "./lib/html.ts";
import { DOMAIN_CATEGORY, DOMAIN_LABEL } from "./lib/labels.ts";
import {
  ASSETS_DIR,
  DOCS,
  INDEX_HTML,
  OPML,
  SITE_URL,
  releaseDir,
  releaseXml,
  reportDir,
  reportXml,
  translatedXml,
} from "./lib/paths.ts";
import { STYLE_CSS } from "./lib/style.ts";
import type { Domain } from "./lib/types.ts";
import { escapeHtml } from "./lib/urls.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}\.html$/;

/** 保持されている日付を新しい順に（YYYY-MM-DD、拡張子なし）。 */
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

type FeedRef = { label: string; file: string; domain: Domain };

function feedRefs(): FeedRef[] {
  const refs: FeedRef[] = [];
  for (const d of CONTENT_DOMAINS) {
    refs.push({ label: `翻訳: ${DOMAIN_LABEL[d]}`, file: `translated-${d}.xml`, domain: d });
    refs.push({ label: `レポート: ${DOMAIN_LABEL[d]}`, file: `report-${d}.xml`, domain: d });
  }
  for (const d of RELEASE_DOMAINS) {
    refs.push({ label: `リリース: ${DOMAIN_LABEL[d]}`, file: `release-${d}.xml`, domain: d });
  }
  return refs;
}

/** feedRefs を DOMAIN_CATEGORY の出現順でグループ化する（CONTENT/RELEASE の定義順を維持）。 */
function groupByCategory<T extends { domain: Domain }>(refs: T[]): [string, T[]][] {
  const groups: [string, T[]][] = [];
  for (const r of refs) {
    const cat = DOMAIN_CATEGORY[r.domain];
    const found = groups.find(([c]) => c === cat);
    if (found) found[1].push(r);
    else groups.push([cat, [r]]);
  }
  return groups;
}

async function domainCard(d: Domain): Promise<string> {
  const isRelease = (RELEASE_DOMAINS as string[]).includes(d);
  const hasContent = (CONTENT_DOMAINS as string[]).includes(d);
  const reports = hasContent ? await listDates(reportDir(d)) : [];
  const release = isRelease ? ((await listDates(releaseDir(d)))[0] ?? null) : null;
  const lines: string[] = [];
  if (hasContent) {
    lines.push(
      reports.length > 0
        ? `<li>日次レポート: ${reports
            .map((r) => `<a href="report/${d}/${r}.html">${r}</a>`)
            .join(" / ")}</li>`
        : "<li>日次レポート: まだありません</li>",
    );
  }
  if (isRelease) {
    lines.push(
      release
        ? `<li>週次リリース最新: <a href="release/${d}/${release}.html">${release}</a></li>`
        : "<li>週次リリース: まだありません</li>",
    );
  }
  const feedLinks: string[] = [];
  const addFeed = async (name: string, file: string, label: string) => {
    if (await Bun.file(file).exists()) feedLinks.push(`<a href="${name}">${label}</a>`);
  };
  if (hasContent) {
    await addFeed(`translated-${d}.xml`, translatedXml(d), "翻訳");
    await addFeed(`report-${d}.xml`, reportXml(d), "レポート");
  }
  if (isRelease) await addFeed(`release-${d}.xml`, releaseXml(d), "リリース");
  if (feedLinks.length > 0) lines.push(`<li>フィード: ${feedLinks.join(" / ")}</li>`);
  return `<section class="card">\n<h3>${DOMAIN_LABEL[d]}</h3>\n<ul>\n${lines.join("\n")}\n</ul>\n</section>`;
}

/** 実在するフィードのみ（初回 CI 実行前の devtools 等を除く）。 */
async function existingFeedRefs(): Promise<FeedRef[]> {
  const out: FeedRef[] = [];
  for (const r of feedRefs()) if (await Bun.file(join(DOCS, r.file)).exists()) out.push(r);
  return out;
}

async function opmlXml(refs: FeedRef[]): Promise<string> {
  const outlines = groupByCategory(refs)
    .map(([cat, catRefs]) => {
      const children = catRefs
        .map(
          (r) =>
            `      <outline type="rss" text="${escapeHtml(r.label)}" title="${escapeHtml(r.label)}" xmlUrl="${SITE_URL}/${r.file}"/>`,
        )
        .join("\n");
      return `    <outline text="${escapeHtml(cat)}" title="${escapeHtml(cat)}">\n${children}\n    </outline>`;
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
  // BOM 付きで書く: GitHub Pages は .opml を charset なしの text/x-opml で返すため、
  // 素の UTF-8 だとブラウザが文字化け表示する。
  const refs = await existingFeedRefs();
  await Bun.write(OPML, `\uFEFF${await opmlXml(refs)}`);

  const cardDomains = [...new Set([...CONTENT_DOMAINS, ...RELEASE_DOMAINS])];
  const rendered = await Promise.all(cardDomains.map(domainCard));
  const cards = new Map<Domain, string>(cardDomains.map((d, i) => [d, rendered[i]]));
  const sections = groupByCategory(cardDomains.map((d) => ({ domain: d })))
    .map(
      ([cat, ds]) =>
        `<h2>${escapeHtml(cat)}</h2>\n${ds.map((x) => cards.get(x.domain)).join("\n")}`,
    )
    .join("\n");
  const body = `<h1>ogontaro / rss</h1>
<p>Claude / Kubernetes / AWS / 開発ツールの情報を日本語で追うための個人用 RSS。
一括購読は <a href="subscriptions.opml">subscriptions.opml</a>。</p>
${sections}`;

  await Bun.write(INDEX_HTML, pageShell({ title: "ogontaro / rss", body }));
  console.log(`index.html + subscriptions.opml (${refs.length} feeds)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
