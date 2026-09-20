import { join } from "node:path";
import type { Domain } from "./types.ts";

export const ROOT = join(import.meta.dir, "..", "..");
export const DOCS = join(ROOT, "docs");
export const CACHE = join(ROOT, ".cache");

export const SOURCE_YAML = join(ROOT, "source.yaml");
export const INTERESTS_YAML = join(ROOT, "interests.yaml");
export const CRITERIA_DIR = join(ROOT, "report-criteria");

export const INDEX_HTML = join(DOCS, "index.html");
export const ASSETS_DIR = join(DOCS, "assets");
export const OPML = join(DOCS, "subscriptions.opml");

/** Public site base, overridable for local preview. */
export const SITE_URL = process.env.SITE_URL ?? "https://ogontaro.github.io/rss";

export const translatedXml = (d: Domain) => join(DOCS, `translated-${d}.xml`);

export const reportXml = (d: Domain) => join(DOCS, `report-${d}.xml`);
export const reportDir = (d: Domain) => join(DOCS, "report", d);
export const reportInputJson = (d: Domain) => join(CACHE, `report-${d}-input.json`);
export const reportMd = (d: Domain) => join(CACHE, `report-${d}.md`);

export const releaseXml = (d: Domain) => join(DOCS, `release-${d}.xml`);
export const releaseDir = (d: Domain) => join(DOCS, "release", d);
export const releaseInputJson = (d: Domain) => join(CACHE, `release-${d}-input.json`);
export const releaseMd = (d: Domain) => join(CACHE, `release-${d}.md`);
