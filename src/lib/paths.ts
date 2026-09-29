import { join } from "node:path";
import type { Domain } from "./types.ts";

export const ROOT = join(import.meta.dir, "..", "..");
export const DOCS = join(ROOT, "docs");
export const CACHE = join(ROOT, ".cache");

export const SOURCE_YAML = join(ROOT, "source.yaml");
export const INTERESTS_YAML = join(ROOT, "interests.yaml");
export const LANDSCAPE_YAML = join(ROOT, "landscape.yaml");
export const ADOPTION_LOG = join(ROOT, "adoption-log.ndjson");
export const STARRED_LOG = join(ROOT, "starred-log.ndjson");
export const FEED_AUDIT_INPUT_JSON = join(CACHE, "feed-audit-input.json");
export const CRITERIA_DIR = join(ROOT, "report-criteria");

export const INDEX_HTML = join(DOCS, "index.html");
export const ASSETS_DIR = join(DOCS, "assets");

/** Public site base, overridable for local preview. */
export const SITE_URL = process.env.SITE_URL ?? "https://ogontaro.github.io/feeds";

// 翻訳配信: 海外サイトのみ、1サイト=1フィード
export const TRANSLATED_DIR = join(DOCS, "translated");
export const translatedFile = (id: string) => join(TRANSLATED_DIR, `${id}.xml`);

// デイジェスト: レポート+リリース、ドメイン単位
export const DIGEST_DIR = join(DOCS, "digest");
export const reportXml = (d: Domain) => join(DIGEST_DIR, `report-${d}.xml`);
export const reportDir = (d: Domain) => join(DIGEST_DIR, "report", d);
export const releaseXml = (d: Domain) => join(DIGEST_DIR, `release-${d}.xml`);
export const releaseDir = (d: Domain) => join(DIGEST_DIR, "release", d);
// 月次トレンドだけはドメイン横断の1本(業界全体の潮流を追うため)
export const TREND_XML = join(DIGEST_DIR, "trend.xml");
export const TREND_DIR = join(DIGEST_DIR, "trend");
/** 技術ランドスケープ: landscape.yaml から build.ts が生成する、現在の状態だけの1ページ */
export const LANDSCAPE_HTML = join(DIGEST_DIR, "landscape.html");

// 購読ファイル: 成果物別に翻訳用/デイジェスト用へ分ける
export const TRANSLATED_OPML = join(DOCS, "opml", "translated.opml");
export const DIGEST_OPML = join(DOCS, "opml", "digest.opml");
export const OPML_DIR = join(DOCS, "opml");

export const reportInputJson = (d: Domain) => join(CACHE, `report-${d}-input.json`);
export const reportMd = (d: Domain) => join(CACHE, `report-${d}.md`);
export const releaseInputJson = (d: Domain) => join(CACHE, `release-${d}-input.json`);
export const releaseMd = (d: Domain) => join(CACHE, `release-${d}.md`);
export const TREND_INPUT_MD = join(CACHE, "trend-input.md");
export const TREND_MD = join(CACHE, "trend.md");
/** AI が書くランドスケープの更新案。landscape-update.ts が検証して landscape.yaml にマージする */
export const LANDSCAPE_UPDATE_YAML = join(CACHE, "landscape-update.yaml");

/** X タイムラインの蓄積(直近 7 日)。actions/cache で実行間を引き継ぐ。リポジトリには置かない。 */
export const X_TIMELINE_JSON = join(CACHE, "x-timeline.json");
/** X タイムラインのうち初回取得が直近 24h のポスト。各ドメインの日次レポートが追加入力として読む。 */
export const X_RECENT_JSON = join(CACHE, "x-recent.json");
