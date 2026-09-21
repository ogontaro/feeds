/**
 * "Translate this page" link for Google Translate.
 * Spaces in `u=` return HTTP 400, so strip whitespace first;
 * encodeURIComponent covers scheme and any `&`/`#` inside the target URL.
 */
export function googleTranslateUrl(articleUrl: string): string {
  const clean = articleUrl.replace(/\s+/g, "");
  return `https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(clean)}`;
}

/**
 * 記事の原文がもともと日本語のソース。翻訳タイトル・概要は付けるが、
 * 「Google 翻訳で全文を読む」導線は無意味なので出さない。
 * フィード自体ではなく記事 URL のホストで判定する（購読を増やしても保守不要、
 * 既存の永続エントリにも次回書き出しで遡って効く）。
 */
const JA_SOURCE_HOSTS = [
  "dev.classmethod.jp",
  "claude-code-log.com",
  "zenn.dev",
  "qiita.com",
  "note.com",
  "hatenablog.com",
  "hateblo.jp",
];

export function isJapaneseSource(articleUrl: string): boolean {
  let host: string;
  try {
    host = new URL(articleUrl).hostname;
  } catch {
    return false;
  }
  return JA_SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Local calendar date in JST (the report is generated at 07:00 JST). */
export function jstDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
