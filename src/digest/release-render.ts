import {
  jstDateString,
  readClaudeOutput,
  recordAdoption,
  writeFeed,
  writePage,
} from "../lib/digest.ts";
import { DOMAIN_LABEL, domainArg } from "../lib/labels.ts";
import { releaseDir, releaseInputJson, releaseMd, releaseXml } from "../lib/paths.ts";

// --refresh: ページ生成(Claude の md が必要)を飛ばし、既存 HTML からフィードだけ作り直す。
const refresh = process.argv.includes("--refresh");

async function main() {
  const domain = domainArg();
  const label = DOMAIN_LABEL[domain];
  const name = `${label} リリースレポート`;
  const dir = releaseDir(domain);

  const md = refresh ? "" : await readClaudeOutput(releaseMd(domain));
  // ページ名はワークフローが走る月曜の日付
  if (md) await writePage(dir, jstDateString(), name, md);

  await writeFeed({
    dir,
    xml: releaseXml(domain),
    name,
    description: `${label} 系ツールの週次リリースまとめ（Claude が注目リリースを選定）`,
    copyright: "各リリースノートの著作権は原著者に帰属します。",
    max: 26, // ~half a year of weekly reports
    date: (page) => new Date(`${page}T22:30:00Z`),
  });

  // project は source.yaml のフィード名
  if (md) await recordAdoption(domain, releaseInputJson(domain), md, "project");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
