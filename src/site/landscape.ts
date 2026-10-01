import { mkdir, rm } from "node:fs/promises";
import { escapeHtml, pageShell } from "../lib/html.ts";
import {
  type Landscape,
  type LandscapeInterests,
  type LandscapeItem,
  QUADRANTS,
  QUADRANT_LABEL,
  RINGS,
  RING_DESC,
  RING_LABEL,
  type Trend,
  loadLandscape,
  loadLandscapeInterests,
  slugOf,
} from "../lib/landscape.ts";
import { DIGEST_DIR, LANDSCAPE_HTML, LANDSCAPE_YAML } from "../lib/paths.ts";

/** 項目の詳細ページ置き場。LANDSCAPE_HTML(docs/digest/landscape.html)の隣 */
const DETAIL_DIR = `${DIGEST_DIR}/landscape`;

const TREND_LABEL: Record<Trend, string> = {
  new: "新規",
  up: "今月言及",
  stable: "変化なし",
  down: "下降",
};

const detailHref = (i: LandscapeItem) => `landscape/${encodeURIComponent(slugOf(i.name))}.html`;

function row(i: LandscapeItem, interested: boolean): string {
  return `<tr${interested ? ' class="hi"' : ""}><td><a href="${detailHref(i)}">${escapeHtml(i.name)}</a></td><td><span class="lx-tag ring-${i.ring}">${RING_LABEL[i.ring]}</span></td><td>${TREND_LABEL[i.trend]}</td><td class="muted">${escapeHtml(i.reason)}</td></tr>`;
}

export function landscapeBody(l: Landscape, mine: LandscapeInterests): string {
  const wanted = new Set(QUADRANTS.flatMap((q) => mine[q]?.items ?? []));
  const known = new Set(l.items.map((i) => i.name));
  const missing = [...wanted].filter((n) => !known.has(n));
  const hiCount = l.items.filter((i) => wanted.has(i.name)).length;

  const sections = QUADRANTS.map((q) => {
    // 興味あり → 段階(Adopt が先)→ 名前 の順
    const items = l.items
      .filter((i) => i.quadrant === q)
      .sort(
        (a, b) =>
          Number(wanted.has(b.name)) - Number(wanted.has(a.name)) ||
          RINGS.indexOf(a.ring) - RINGS.indexOf(b.ring) ||
          a.name.localeCompare(b.name, "ja"),
      );
    const focus = mine[q]?.focus ? `<p class="lx-focus">${escapeHtml(mine[q].focus)}</p>` : "";
    return `<section class="lx-q q-${q}" id="${q}">
<h2>${escapeHtml(QUADRANT_LABEL[q])}</h2>
${focus}
<div class="lx-scroll"><table class="lx-table">
<thead><tr><th>項目</th><th>段階</th><th>動き</th><th>根拠</th></tr></thead>
<tbody>
${items.map((i) => row(i, wanted.has(i.name))).join("\n")}
</tbody>
</table></div>
</section>`;
  }).join("\n");

  const missingHtml =
    missing.length > 0
      ? `<h2>全量にまだない興味</h2>
<p class="muted">interests.yaml の landscape にあるが、landscape.yaml に載っていない項目です。名前の誤りか、次回の月次更新での追加待ちです。</p>
<ul>${missing.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
      : "";
  const changes =
    l.changes?.length > 0
      ? `<ul>${l.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
      : '<p class="muted">変更なし</p>';

  return `<h1>技術ランドスケープ</h1>
<p class="muted">${escapeHtml(l.updated)} の月次トレンドまで反映。全 ${l.items.length} 項目のうち、興味ありは ${hiCount} 項目（表の先頭・強調表示）。興味は interests.yaml で管理しています。</p>
<p class="lx-nav">${QUADRANTS.map((q) => `<a class="q-${q}" href="#${q}">${escapeHtml(QUADRANT_LABEL[q])}</a>`).join("")}</p>
<p class="muted">段階: ${RINGS.map((r) => `<b>${RING_LABEL[r]}</b> ${RING_DESC[r]}`).join(" / ")}</p>
${sections}
${missingHtml}
<h2>今月の変更</h2>
${changes}`;
}

function detailBody(i: LandscapeItem, interested: boolean): string {
  const cited = i.lastCited
    ? `<a href="../trend/${i.lastCited}.html">${i.lastCited}</a>`
    : "まだ取り上げられていません";
  return `<p><a href="../landscape.html">← 技術ランドスケープ</a></p>
<h1>${escapeHtml(i.name)}</h1>
<p class="q-${i.quadrant}"><span class="lx-tag">${escapeHtml(QUADRANT_LABEL[i.quadrant])}</span> <span class="lx-tag ring-${i.ring}">${RING_LABEL[i.ring]}</span> <span class="lx-tag">${TREND_LABEL[i.trend]}</span>${interested ? ' <span class="lx-tag hi">興味あり</span>' : ""}</p>
<h2>どういうものか</h2>
<p>${escapeHtml(i.summary)}</p>
<h2>この段階にある理由</h2>
<p><b>${RING_LABEL[i.ring]}</b>（${RING_DESC[i.ring]}）</p>
<p>${escapeHtml(i.reason)}</p>
<h2>履歴</h2>
<ul>
<li>掲載開始: ${escapeHtml(i.since)}</li>
<li>月次トレンドで最後に取り上げられた月: ${cited}</li>
</ul>`;
}

export async function writeLandscapePage(): Promise<boolean> {
  if (!(await Bun.file(LANDSCAPE_YAML).exists())) return false;
  const [l, mine] = await Promise.all([loadLandscape(), loadLandscapeInterests()]);
  await Bun.write(
    LANDSCAPE_HTML,
    pageShell({ title: "技術ランドスケープ", body: landscapeBody(l, mine), depth: 1 }),
  );
  const wanted = new Set(QUADRANTS.flatMap((q) => mine[q]?.items ?? []));
  // 外れた項目のページが残らないよう、詳細ページは毎回作り直す
  await rm(DETAIL_DIR, { recursive: true, force: true });
  await mkdir(DETAIL_DIR, { recursive: true });
  for (const i of l.items) {
    await Bun.write(
      `${DETAIL_DIR}/${slugOf(i.name)}.html`,
      pageShell({ title: i.name, body: detailBody(i, wanted.has(i.name)), depth: 2 }),
    );
  }
  return true;
}
