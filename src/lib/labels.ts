import type { Domain } from "./types.ts";

export const DOMAIN_LABEL: Record<Domain, string> = {
  claude: "Claude",
  kubernetes: "Kubernetes",
  aws: "AWS",
  devtools: "開発ツール",
};

/** インデックスと OPML のフォルダ分けに使うカテゴリ。 */
export const DOMAIN_CATEGORY: Record<Domain, string> = {
  claude: "AI",
  kubernetes: "プラットフォーム",
  aws: "プラットフォーム",
  devtools: "開発ツール",
};

/** Parse and validate a domain passed as a CLI arg. */
export function domainArg(): Domain {
  const d = process.argv[2];
  if (!(d in DOMAIN_LABEL)) {
    throw new Error(
      `usage: <script> <${Object.keys(DOMAIN_LABEL).join("|")}> (got: ${d ?? "nothing"})`,
    );
  }
  return d as Domain;
}
