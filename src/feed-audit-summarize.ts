import { execSync } from "node:child_process";
import { parse } from "yaml";
import { INTERESTS_YAML, SOURCE_YAML } from "./lib/paths.ts";
import type { Feed, FeedsConfig } from "./lib/types.ts";

function feedsFrom(raw: string): Feed[] {
  return (parse(raw) as FeedsConfig)?.feeds ?? [];
}

function atHead(path: string): string {
  try {
    return execSync(`git show HEAD:${path}`, { encoding: "utf-8" });
  } catch {
    return ""; // file didn't exist at HEAD
  }
}

/** Diffs source.yaml/interests.yaml against HEAD to describe what a feed-audit/issue-request run changed. */
async function main() {
  const before = feedsFrom(atHead("source.yaml"));
  const after = feedsFrom(await Bun.file(SOURCE_YAML).text());
  const beforeByUrl = new Map(before.map((f) => [f.url, f]));

  const added = after.filter((f) => !beforeByUrl.has(f.url));
  const disabled = after.filter((f) => {
    const b = beforeByUrl.get(f.url);
    return b && b.enabled !== false && f.enabled === false;
  });

  const interestsChanged = atHead("interests.yaml") !== (await Bun.file(INTERESTS_YAML).text());

  const lines: string[] = [];
  if (added.length > 0) {
    lines.push("### 追加したフィード");
    for (const f of added) lines.push(`- ${f.name} (${f.domain}/${f.kind}) — ${f.url}`);
    lines.push("");
  }
  if (disabled.length > 0) {
    lines.push("### 無効化したフィード");
    for (const f of disabled) lines.push(`- ${f.name} (${f.domain})`);
    lines.push("");
  }
  if (interestsChanged) lines.push("`interests.yaml` も更新されました。");
  if (lines.length === 0) lines.push("設定ファイルの変更なし。");

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
