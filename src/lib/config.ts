import { parse } from "yaml";
import { FEEDS_YAML } from "./paths.ts";
import type { Domain, Feed, FeedsConfig } from "./types.ts";

export const CONTENT_DOMAINS: Domain[] = ["claude", "kubernetes", "aws"];
export const RELEASE_DOMAINS: Domain[] = ["claude", "kubernetes", "aws"];

const DOMAINS = new Set<string>(["claude", "kubernetes", "aws"]);
const KINDS = new Set<string>(["content", "release"]);

export async function loadFeeds(): Promise<Feed[]> {
  const raw = await Bun.file(FEEDS_YAML).text();
  const parsed = parse(raw) as FeedsConfig;
  const feeds = parsed?.feeds ?? [];
  if (feeds.length === 0) throw new Error("feeds.yaml has no feeds");
  for (const f of feeds) {
    if (!f.url || !f.name)
      throw new Error(`feeds.yaml: entry missing url or name: ${JSON.stringify(f)}`);
    if (!DOMAINS.has(f.domain))
      throw new Error(`feeds.yaml: bad domain "${f.domain}" for ${f.name}`);
    if (!KINDS.has(f.kind)) throw new Error(`feeds.yaml: bad kind "${f.kind}" for ${f.name}`);
    f.enabled ??= true;
  }
  return feeds;
}

export const contentFeeds = (feeds: Feed[], domain: Domain): Feed[] =>
  feeds.filter((f) => f.enabled !== false && f.kind === "content" && f.domain === domain);

export const releaseFeeds = (feeds: Feed[], domain: Domain): Feed[] =>
  feeds.filter((f) => f.enabled !== false && f.kind === "release" && f.domain === domain);
