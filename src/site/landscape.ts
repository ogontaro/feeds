import { pageShell } from "../lib/html.ts";
import {
  type Landscape,
  type LandscapeItem,
  QUADRANTS,
  QUADRANT_LABEL,
  type Quadrant,
  RINGS,
  RING_LABEL,
  type Trend,
  loadLandscape,
} from "../lib/landscape.ts";
import { LANDSCAPE_HTML, LANDSCAPE_YAML } from "../lib/paths.ts";
import { escapeHtml } from "../lib/urls.ts";

const SIZE = 640;
const C = SIZE / 2;
/** 内側から Adopt / Trial / Assess / Hold の境界半径 */
const RADII = [0, 120, 190, 250, 300];
/** SVG 座標(y 下向き)での各象限の開始角。左上から時計回り */
const QUADRANT_START: Record<Quadrant, number> = { ai: 180, platform: 270, ops: 0, practice: 90 };
const MIN_GAP = 26;
const AXIS_GAP = 18;

const TREND_LABEL: Record<Trend, string> = {
  new: "新規",
  up: "今月言及",
  stable: "変化なし",
  down: "下降",
};

/** 名前から決まる [0,1) の擬似乱数。月をまたいでも点の位置が動かないようにする */
function unit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // FNV だけだと末尾 1 文字違いの値が偏るので、murmur3 の fmix32 で攪拌する
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

type Placed = LandscapeItem & { no: number; x: number; y: number };

function place(items: LandscapeItem[]): Placed[] {
  const placed: Placed[] = [];
  for (const [i, item] of items.entries()) {
    const ring = RINGS.indexOf(item.ring);
    const [rin, rout] = [RADII[ring], RADII[ring + 1]];
    let best = { x: C, y: C, gap: -1 };
    for (let k = 0; k < 40 && best.gap < MIN_GAP; k++) {
      const deg = QUADRANT_START[item.quadrant] + 10 + unit(`${item.name}#${k}a`) * 70;
      const r = rin + 14 + unit(`${item.name}#${k}b`) * (rout - rin - 28);
      const x = C + r * Math.cos((deg * Math.PI) / 180);
      const y = C + r * Math.sin((deg * Math.PI) / 180);
      // 軸の上には段階名のラベルがあるので、軸から AXIS_GAP 以内の候補は重なり扱いにする
      const axis = Math.min(Math.abs(x - C), Math.abs(y - C));
      const gap = Math.min(
        axis < AXIS_GAP ? 0 : Number.POSITIVE_INFINITY,
        ...placed.map((p) => Math.hypot(p.x - x, p.y - y)),
      );
      if (gap > best.gap) best = { x, y, gap };
    }
    placed.push({ ...item, no: i + 1, x: best.x, y: best.y });
  }
  return placed;
}

/** 形 = トレンド、塗り = 関心(塗り=高 / 白抜き=低)、色 = 象限 */
function blipShape(trend: Trend, x: number, y: number): string {
  const f = (n: number) => n.toFixed(1);
  switch (trend) {
    case "up":
      return `<polygon points="${f(x)},${f(y - 14)} ${f(x - 13)},${f(y + 9)} ${f(x + 13)},${f(y + 9)}"/>`;
    case "down":
      return `<polygon points="${f(x)},${f(y + 14)} ${f(x - 13)},${f(y - 9)} ${f(x + 13)},${f(y - 9)}"/>`;
    case "new":
      return `<circle class="halo" cx="${f(x)}" cy="${f(y)}" r="15"/><circle cx="${f(x)}" cy="${f(y)}" r="11"/>`;
    default:
      return `<circle cx="${f(x)}" cy="${f(y)}" r="11"/>`;
  }
}

function radarSvg(placed: Placed[]): string {
  const rings = RADII.slice(1)
    .map((r, i) => `<circle class="lx-ring lx-ring-${i}" cx="${C}" cy="${C}" r="${r}"/>`)
    .reverse()
    .join("");
  const ringLabels = RINGS.map((ring, i) => {
    const x = C + (RADII[i] + RADII[i + 1]) / 2;
    return `<text class="lx-ring-label" x="${x}" y="${C + 4}">${RING_LABEL[ring]}</text>`;
  }).join("");
  const corner: Record<Quadrant, [number, number, string]> = {
    ai: [8, 20, "start"],
    platform: [SIZE - 8, 20, "end"],
    practice: [8, SIZE - 10, "start"],
    ops: [SIZE - 8, SIZE - 10, "end"],
  };
  const qLabels = QUADRANTS.map((q) => {
    const [x, y, anchor] = corner[q];
    return `<text class="lx-q-label q-${q}" x="${x}" y="${y}" text-anchor="${anchor}">${escapeHtml(QUADRANT_LABEL[q])}</text>`;
  }).join("");
  const blips = placed
    .map((p) => {
      const title = `${p.no}. ${p.name} — ${RING_LABEL[p.ring]} / ${TREND_LABEL[p.trend]} / 関心${p.interest === "high" ? "高" : "低"}`;
      return `<g class="blip q-${p.quadrant} ${p.interest}"><title>${escapeHtml(title)}</title>${blipShape(p.trend, p.x, p.y)}<text x="${p.x.toFixed(1)}" y="${(p.y + (p.trend === "down" ? -2 : p.trend === "up" ? 3 : 0)).toFixed(1)}">${p.no}</text></g>`;
    })
    .join("");
  return `<svg class="lx-radar" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="技術ランドスケープのレーダー図">
${rings}
<line class="lx-axis" x1="${C - RADII[4]}" y1="${C}" x2="${C + RADII[4]}" y2="${C}"/>
<line class="lx-axis" x1="${C}" y1="${C - RADII[4]}" x2="${C}" y2="${C + RADII[4]}"/>
${ringLabels}${qLabels}${blips}
</svg>`;
}

const LEGEND = `<div class="lx-legend">
<span><svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="9" class="lx-key"/></svg>関心高</span>
<span><svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="9" class="lx-key low"/></svg>関心低</span>
<span><svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" class="lx-key halo"/><circle cx="15" cy="15" r="9" class="lx-key"/></svg>新規</span>
<span><svg viewBox="0 0 30 30"><polygon points="15,3 4,24 26,24" class="lx-key"/></svg>今月の月次トレンドで言及</span>
<span><svg viewBox="0 0 30 30"><polygon points="15,27 4,6 26,6" class="lx-key"/></svg>下降（衰退の指摘か、半年言及なし）</span>
</div>`;

function itemList(q: Quadrant, placed: Placed[]): string {
  const lis = placed
    .filter((p) => p.quadrant === q)
    .map(
      (p) =>
        `<li value="${p.no}"><strong>${escapeHtml(p.name)}</strong> <span class="lx-tag ring-${p.ring}">${RING_LABEL[p.ring]}</span> <span class="lx-tag">${TREND_LABEL[p.trend]}</span>${p.interest === "high" ? ' <span class="lx-tag hi">関心高</span>' : ""}<br><span class="muted">${escapeHtml(p.reason)}</span></li>`,
    )
    .join("\n");
  return `<section class="lx-quadrant q-${q}"><h3>${escapeHtml(QUADRANT_LABEL[q])}</h3>\n<ol>\n${lis}\n</ol></section>`;
}

export function landscapeBody(l: Landscape): string {
  const sorted = QUADRANTS.flatMap((q) =>
    l.items
      .filter((i) => i.quadrant === q)
      .sort(
        (a, b) =>
          RINGS.indexOf(a.ring) - RINGS.indexOf(b.ring) || a.name.localeCompare(b.name, "ja"),
      ),
  );
  const placed = place(sorted);
  const focus = QUADRANTS.map(
    (q) =>
      `<section class="card lx-focus q-${q}"><h3>${escapeHtml(QUADRANT_LABEL[q])}</h3><p>${escapeHtml(l.focus?.[q] ?? "")}</p></section>`,
  ).join("\n");
  const changes =
    l.changes?.length > 0
      ? `<ul>${l.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
      : '<p class="muted">変更なし</p>';
  return `<h1>技術ランドスケープ</h1>
<p class="muted">${escapeHtml(l.updated)} の月次トレンドまで反映。段階は実際に使っているツールとの距離（Adopt 中心ツールを使用 / Trial 延長で試せる / Assess 調べておく / Hold 見送る）。日次・週次・月次レポートの参考資料にもしている。</p>
<h2>関心領域</h2>
<div class="cards lx-focus-grid">
${focus}
</div>
<h2>全体像</h2>
${radarSvg(placed)}
${LEGEND}
<h2>今月の変更</h2>
${changes}
<h2>一覧</h2>
${QUADRANTS.map((q) => itemList(q, placed)).join("\n")}`;
}

export async function writeLandscapePage(): Promise<boolean> {
  if (!(await Bun.file(LANDSCAPE_YAML).exists())) return false;
  const body = landscapeBody(await loadLandscape());
  await Bun.write(LANDSCAPE_HTML, pageShell({ title: "技術ランドスケープ", body, depth: 1 }));
  return true;
}
