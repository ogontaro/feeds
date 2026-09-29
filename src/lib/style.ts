/** Written to docs/assets/style.css by build.ts (single owner). */
export const STYLE_CSS = `:root {
  color-scheme: light dark;
  --fg: #1a1a1a; --bg: #fdfdfd; --bg-elevated: #fff; --muted: #5f5f5f;
  --accent: #0b5fff; --accent-soft: #eaf1ff; --line: #e4e4e4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #e6e6e6; --bg: #14161a; --bg-elevated: #1c1e23; --muted: #a8a8a8;
    --accent: #7db0ff; --accent-soft: #1c2c47; --line: #2c2f36;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; max-width: 760px; padding: 0 1rem 4rem;
  font: 16px/1.8 -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  color: var(--fg); background: var(--bg);
}
a { color: var(--accent); }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
code { background: var(--accent-soft); padding: .1em .35em; border-radius: 4px; font-size: .9em; word-break: break-word; }

header {
  position: sticky; top: 0; z-index: 10;
  margin: 0 -1rem 1.8rem; padding: .9rem 1rem;
  background: var(--bg); border-bottom: 1px solid var(--line);
}
header a { font-weight: 700; text-decoration: none; color: var(--fg); font-size: 1.05rem; }

h1 { font-size: 1.6rem; line-height: 1.4; margin: .2rem 0 1.2rem; }
h2 { font-size: 1.2rem; margin: 2.2rem 0 1rem; padding-bottom: .4rem; border-bottom: 2px solid var(--accent-soft); }
ul { padding-left: 1.2rem; }
li { margin: .3rem 0; }
main > p.muted { margin-top: -.6rem; }
.muted { color: var(--muted); font-size: .85rem; font-weight: 400; }

/* 日次レポート/週次リリース本文。記事(### 単位)は html.ts の digestArticle が section.item に包む */
.report h2 { margin-top: 1.8rem; }
.report .item {
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg-elevated);
  padding: 1rem 1.1rem; margin: 0 0 1rem;
}
.report .item h3 { font-size: 1.08rem; line-height: 1.5; margin: 0 0 .6rem; }
.report .item p, .report .item ul { margin: 0 0 .8rem; }
.report .item > :last-child { margin-bottom: 0; }
.report .item ul { font-size: .92rem; }
.report .links { display: flex; flex-wrap: wrap; gap: .5rem; }
.report .links a {
  display: inline-block; padding: .4rem .9rem;
  border-radius: 999px; background: var(--accent-soft); border: 1px solid var(--line);
  font-size: .88rem; line-height: 1.4; font-weight: 600; text-decoration: none; color: var(--accent);
}
.report .links a:hover { border-color: var(--accent); }
@media (max-width: 480px) {
  .report .item { padding: .9rem; }
  .report .links a { flex: 1 1 auto; text-align: center; }
}
/* カード化以前に生成済みのページ用(section.item が無く h3 が article 直下)。旧ページが保持期間で消えたら削除してよい */
.report > h3 { font-size: 1.05rem; margin: 0; padding: 1.4rem 0 .4rem; border-top: 1px solid var(--line); }
.report > h2 + h3 { border-top: none; padding-top: 0; }
.report > h3 ~ p { margin: 0 0 1.6rem; }
.report > h3 ~ p a {
  display: inline-block; margin: .3rem .3rem 0 0; padding: .2rem .7rem;
  border-radius: 999px; background: var(--accent-soft); border: 1px solid var(--line);
  font-size: .85rem; text-decoration: none; color: var(--accent);
}

/* トップページのドメインカード */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .9rem; margin: 1rem 0 2rem; }
.card {
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg-elevated);
  padding: 1rem 1.1rem; margin: 0;
}
.card h3 { font-size: 1.05rem; margin: 0 0 .6rem; }
.card ul { list-style: none; padding: 0; margin: 0; }
.card li { padding: .45rem 0; margin: 0; font-size: .92rem; border-top: 1px solid var(--line); }
.card li:first-child { border-top: none; padding-top: 0; }

/* 技術ランドスケープ(src/site/landscape.ts)。象限ごとの色 */
:root { --q-ai: #7048e8; --q-platform: #0c8599; --q-practice: #d9480f; --q-ops: #2b8a3e; --blip-fg: #fff; }
@media (prefers-color-scheme: dark) {
  :root { --q-ai: #b197fc; --q-platform: #3bc9db; --q-practice: #ffa94d; --q-ops: #8ce99a; --blip-fg: #14161a; }
}
.q-ai { --q: var(--q-ai); } .q-platform { --q: var(--q-platform); }
.q-practice { --q: var(--q-practice); } .q-ops { --q: var(--q-ops); }
.lx-radar { display: block; width: 100%; height: auto; margin: 1rem 0; }
.lx-ring { fill: var(--fg); stroke: var(--line); }
.lx-ring-0 { fill-opacity: .07; } .lx-ring-1 { fill-opacity: .05; }
.lx-ring-2 { fill-opacity: .03; } .lx-ring-3 { fill-opacity: .015; }
.lx-axis { stroke: var(--line); stroke-width: 1.5; }
.lx-ring-label { fill: var(--muted); font-size: 12px; font-weight: 700; text-anchor: middle; paint-order: stroke; stroke: var(--bg); stroke-width: 4px; }
.lx-q-label { fill: var(--q); font-size: 15px; font-weight: 700; }
.blip circle, .blip polygon { fill: var(--q); stroke: var(--q); stroke-width: 2; }
.blip.low circle, .blip.low polygon { fill: var(--bg-elevated); }
.blip .halo { fill: none !important; stroke-dasharray: 3 2; }
.blip text { fill: var(--blip-fg); font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
.blip.low text { fill: var(--q); }
.lx-legend { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; font-size: .85rem; color: var(--muted); }
.lx-legend span { display: inline-flex; align-items: center; gap: .3rem; }
.lx-legend svg { width: 1.3rem; height: 1.3rem; }
.lx-key { fill: var(--muted); stroke: var(--muted); stroke-width: 2; }
.lx-key.low { fill: var(--bg); }
.lx-key.halo { fill: none; stroke-dasharray: 3 2; }
.lx-focus-grid { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.lx-focus { border-left: 4px solid var(--q); }
.lx-focus h3 { color: var(--q); }
.lx-focus p { margin: 0; font-size: .92rem; }
.lx-quadrant h3 { color: var(--q); margin: 1.6rem 0 .4rem; }
.lx-quadrant ol { padding-left: 2rem; }
.lx-quadrant li { margin: .5rem 0; }
.lx-quadrant li::marker { color: var(--q); font-weight: 700; }
.lx-tag { display: inline-block; padding: 0 .5rem; border-radius: 999px; border: 1px solid var(--line); font-size: .75rem; color: var(--muted); }
.lx-tag.hi { color: var(--q); border-color: var(--q); }
.lx-tag.ring-adopt, .lx-tag.ring-trial { color: var(--fg); font-weight: 700; }

footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem; }
`;
