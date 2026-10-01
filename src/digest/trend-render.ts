import { readClaudeOutput, writeFeed, writePage } from "../lib/digest.ts";
import { TREND_DIR, TREND_INPUT_MD, TREND_MD, TREND_XML } from "../lib/paths.ts";

async function main() {
  const month = (await Bun.file(TREND_INPUT_MD).text()).match(/^# 対象月: (\d{4}-\d{2})/)?.[1];
  if (!month) throw new Error(`${TREND_INPUT_MD} has no 対象月 header`);
  const name = "月次トレンドレポート";

  await writePage(TREND_DIR, month, name, await readClaudeOutput(TREND_MD));
  await writeFeed({
    dir: TREND_DIR,
    xml: TREND_XML,
    name,
    description: "業界全体の潮流(新しい概念・呼称の出現と定着)を月次で追うレポート",
    copyright: "引用元記事の著作権は原著者に帰属します。",
    max: 24, // 2 年分
    date: (page) => {
      const [y, mo] = page.split("-").map(Number);
      return new Date(Date.UTC(y, mo, 1, 22, 45)); // 翌月2日 07:45 JST の公開時刻
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
