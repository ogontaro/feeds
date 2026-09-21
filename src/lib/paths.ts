import { join } from "node:path";
import type { Domain } from "./types.ts";

export const ROOT = join(import.meta.dir, "..", "..");
export const DOCS = join(ROOT, "docs");
export const CACHE = join(ROOT, ".cache");

export const SOURCE_YAML = join(ROOT, "source.yaml");
export const INTERESTS_YAML = join(ROOT, "interests.yaml");
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

// 購読ファイル: 成果物別に翻訳用/デイジェスト用へ分ける
export const TRANSLATED_OPML = join(DOCS, "opml", "translated.opml");
export const DIGEST_OPML = join(DOCS, "opml", "digest.opml");
export const OPML_DIR = join(DOCS, "opml");

export const reportInputJson = (d: Domain) => join(CACHE, `report-${d}-input.json`);
export const reportMd = (d: Domain) => join(CACHE, `report-${d}.md`);
export const releaseInputJson = (d: Domain) => join(CACHE, `release-${d}-input.json`);
export const releaseMd = (d: Domain) => join(CACHE, `release-${d}.md`);
