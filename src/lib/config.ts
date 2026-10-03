import { parse } from "yaml";
import { DOMAIN_LABEL } from "./labels.ts";
import { INTERESTS_YAML, SOURCE_YAML } from "./paths.ts";
import type { Domain, DomainInterests, Feed, FeedsConfig, InterestsConfig, Kind } from "./types.ts";

// 日次レポートは content フィードを持つドメイン単位。X タイムラインは独立したレポートを持たず、各ドメインの追加入力になる。
export const REPORT_DOMAINS: Domain[] = ["claude", "kubernetes", "aws", "gadget"];
// devtools はリリースのみ（購読は手元ツールの GitHub releases で、日次レポート入力は無い）。
export const RELEASE_DOMAINS: Domain[] = ["claude", "kubernetes", "aws", "devtools"];

const KINDS: Kind[] = ["content", "release"];

export async function loadFeeds(): Promise<Feed[]> {
  const raw = await Bun.file(SOURCE_YAML).text();
  const parsed = parse(raw) as FeedsConfig;
  const feeds = parsed?.feeds ?? [];
  if (feeds.length === 0) throw new Error("source.yaml has no feeds");
  for (const f of feeds) {
    if (!f.url || !f.name)
      throw new Error(`source.yaml: entry missing url or name: ${JSON.stringify(f)}`);
    if (!(f.domain in DOMAIN_LABEL))
      throw new Error(`source.yaml: bad domain "${f.domain}" for ${f.name}`);
    if (!KINDS.includes(f.kind)) throw new Error(`source.yaml: bad kind "${f.kind}" for ${f.name}`);
    f.enabled ??= true;
  }
  return feeds;
}

export async function loadInterests(domain: Domain): Promise<DomainInterests> {
  const raw = await Bun.file(INTERESTS_YAML).text();
  const parsed = parse(raw) as InterestsConfig;
  return parsed?.interests?.[domain] ?? { include: [], exclude: [] };
}

/** 有効な購読フィードのうち、ドメインと種別が一致するもの。 */
export const feedsOf = (feeds: Feed[], domain: Domain, kind: Kind): Feed[] =>
  feeds.filter((f) => f.enabled !== false && f.kind === kind && f.domain === domain);
