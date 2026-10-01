import { rm } from "node:fs/promises";
import {
  jstDateString,
  listPages,
  readClaudeOutput,
  recordAdoption,
  writeFeed,
  writePage,
} from "../lib/digest.ts";
import { DOMAIN_LABEL, domainArg } from "../lib/labels.ts";
import { reportDir, reportInputJson, reportMd, reportXml } from "../lib/paths.ts";

// --refresh: ページ生成(Claude の md が必要)を飛ばし、既存 HTML からフィードだけ作り直す。
// 構成変更時の移行・再パブリッシュ用。
const refresh = process.argv.includes("--refresh");

/** 当日に見られなかった日を含めて遡れる日数。月次トレンドが前月ぶんを読むので 1 か月強。これより古い HTML は容量対策で消す。 */
const RETENTION_DAYS = 35;

/**
 * 保持期間より古いレポート HTML を削除する。フィード生成前に呼ぶので、
 * 残る XML のリンクは必ず実在する HTML を指す。
 * ページ名は YYYY-MM-DD 固定なので、辞書順比較がそのまま日次比較になる。
 */
async function pruneOldReports(dir: string, today: string): Promise<void> {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (RETENTION_DAYS - 1));
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const removed = (await listPages(dir)).filter((page) => page < cutoffDate);
  for (const page of removed) await rm(`${dir}/${page}.html`);
  if (removed.length > 0) {
    console.log(
      `pruned ${removed.length} report(s) older than ${cutoffDate}: ${removed.join(", ")}`,
    );
  }
}

async function main() {
  const domain = domainArg();
  const label = DOMAIN_LABEL[domain];
  const name = `${label} 日次レポート`;
  const dir = reportDir(domain);

  const md = refresh ? "" : await readClaudeOutput(reportMd(domain));
  if (md) {
    const date = jstDateString();
    await writePage(dir, date, name, md);
    await pruneOldReports(dir, date);
  }

  await writeFeed({
    dir,
    xml: reportXml(domain),
    name,
    description: `${label} 系の新着から重要な記事を Claude が選定した日次レポート`,
    copyright: "各記事の著作権は原著者に帰属します。",
    max: 60,
    date: (page) => new Date(`${page}T22:00:00Z`),
  });

  // 採用ログはドメイン入力(フィード)だけを見る。X のポストは別ファイルなので投稿者は公開ログに残らない。
  if (md) await recordAdoption(domain, reportInputJson(domain), md, "source");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
