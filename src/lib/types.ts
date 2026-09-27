export type Domain = "claude" | "kubernetes" | "aws" | "devtools";
export type Kind = "content" | "release";

export type Feed = {
  url: string;
  name: string;
  /**
   * 翻訳フィードのファイル識別子(translated/<id>.xml)。
   * 海外サイトの content フィードは必須。日本語サイトと release フィードは不要。
   */
  id?: string;
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

/** A normalized entry from a source feed, before translation. */
export type SourceEntry = {
  guid: string;
  link: string;
  title: string;
  description: string;
  pubDate: Date;
  sourceName: string;
};

/** An entry after translation, as persisted in translated/<id>.xml (one site per feed). */
export type TranslatedEntry = {
  guid: string;
  link: string;
  titleJa: string;
  descriptionJa: string;
  pubDate: Date;
};
