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

/* 日次レポート/週次リリース本文(Claude生成markdown由来なのでラッパーdivは無い前提) */
.report h2 { margin-top: 1.8rem; }
.report h3 {
  font-size: 1.05rem; margin: 0; padding: 1.4rem 0 .4rem;
  border-top: 1px solid var(--line);
}
.report h2 + h3 { border-top: none; padding-top: 0; }
.report p { margin: 0 0 1.6rem; }
.report p a {
  display: inline-block; margin: .3rem .3rem 0 0; padding: .2rem .7rem;
  border-radius: 999px; background: var(--accent-soft); border: 1px solid var(--line);
  font-size: .85rem; text-decoration: none; color: var(--accent);
}
.report p a:hover { border-color: var(--accent); }

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

footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem; }
`;
