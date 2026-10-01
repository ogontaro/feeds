export type Domain = "claude" | "kubernetes" | "aws" | "devtools";
export type Kind = "content" | "release";

export type Feed = {
  url: string;
  name: string;
  domain: Domain;
  kind: Kind;
  enabled?: boolean;
  /** ISO date this feed was added to source.yaml. */
  addedAt?: string;
  /** ISO date this feed's article was last selected into a report/release. */
  lastAdoptedAt?: string;
};

export type FeedsConfig = {
  feeds: Feed[];
};

export type DomainInterests = {
  include: string[];
  exclude: string[];
};

export type InterestsConfig = {
  interests: Record<Domain, DomainInterests>;
};

/** A normalized entry from a source feed, from a source feed. */
export type SourceEntry = {
  guid: string;
  link: string;
  title: string;
  description: string;
  pubDate: Date;
  sourceName: string;
};
