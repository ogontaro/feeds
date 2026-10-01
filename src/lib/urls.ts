/**
 * "Translate this page" link for Google Translate.
 * Spaces in `u=` return HTTP 400, so strip whitespace first;
 * encodeURIComponent covers scheme and any `&`/`#` inside the target URL.
 */
export function googleTranslateUrl(articleUrl: string): string {
  const clean = articleUrl.replace(/\s+/g, "");
  return `https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(clean)}`;
}

/** UTF-8 BOM。charset なしで配信されるファイル(.opml)のブラウザ表示化け対策に付ける。 */
export const UTF8_BOM = "\uFEFF";

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
