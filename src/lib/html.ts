import { Marked } from "marked";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 段落末尾(改行の後)、または段落全体がリンクだけの行。 */
const LINK_ROW_RE = /^(?:([\s\S]*?)<br>\s*)?((?:<a [^>]*>[^<]*<\/a>(?:\s*\/\s*)?)+)\s*$/;

// breaks: Claude はコメントとリンク行を改行1つで続けて書くので、soft break を <br> にする。
const digestMarked = new Marked({
  breaks: true,
  renderer: {
    paragraph(text) {
      const m = text.match(LINK_ROW_RE);
      if (!m) return `<p>${text}</p>\n`;
      const links = m[2].replace(/<\/a>\s*\/\s*/g, "</a> ");
      return `${m[1] ? `<p>${m[1]}</p>\n` : ""}<p class="links">${links.trim()}</p>\n`;
    },
  },
});

/**
 * 日次レポート/週次リリースの本文。`### 記事` から次の見出しまでを1枚のカードにまとめる。
 * `articleBody` が `<article class="report">` の中身を切り出すので、ラッパーはこの形のまま保つ。
 */
export async function digestArticle(md: string): Promise<string> {
  const html = await digestMarked.parse(md);
  const carded = html.replace(
    /<h3[\s\S]*?(?=<h[23][\s>]|$)/g,
    (s) => `<section class="item">\n${s.trim()}\n</section>\n`,
  );
  return `<article class="report">${carded}</article>`;
}

/** `digestArticle` が書いたページからレポート本文(ラッパーの中身)を取り出す。 */
export const articleBody = (html: string): string =>
  html.match(/<article class="report">([\s\S]*?)<\/article>/)?.[1] ?? html;

/**
 * Shared page shell. `depth` is how many directories below docs/ the page lives:
 * 0 for docs/index.html, 3 for docs/digest/report/<domain>/<date>.html.
 */
export function pageShell(opts: { title: string; body: string; depth?: number }): string {
  const base = opts.depth ? "../".repeat(opts.depth).replace(/\/$/, "") : ".";
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<link rel="stylesheet" href="${base}/assets/style.css">
</head>
<body>
<header><a href="${base}/">ogontaro / rss</a></header>
<main>
${opts.body}
</main>
<footer>概要・コメントは AI が生成しています。記事本文の著作権は各原著者に帰属します。</footer>
</body>
</html>
`;
}
