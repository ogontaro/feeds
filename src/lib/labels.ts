import type { Domain } from "./types.ts";

export const DOMAIN_LABEL: Record<Domain, string> = {
  claude: "Claude",
  kubernetes: "Kubernetes",
  aws: "AWS",
  devtools: "開発ツール",
  gadget: "ガジェット",
  gaming: "ゲーム環境",
};

/** トップページのカードに添える用途（仕事 / 趣味）。 */
export const DOMAIN_CATEGORY: Record<Domain, string> = {
  claude: "仕事",
  kubernetes: "仕事",
  aws: "仕事",
  devtools: "仕事",
  gadget: "趣味",
  gaming: "趣味",
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
