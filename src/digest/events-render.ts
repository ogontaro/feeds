import { jstDateString, readClaudeOutput, writeFeed, writePage } from "../lib/digest.ts";
import { EVENTS_DIR, EVENTS_MD, EVENTS_XML } from "../lib/paths.ts";

async function main() {
  // 公開月のページ。内容は「今後2ヶ月の開催予定」なので、月が変われば作り直す。
  const month = jstDateString().slice(0, 7);
  const name = "月次イベント";

  await writePage(EVENTS_DIR, month, name, await readClaudeOutput(EVENTS_MD));
  await writeFeed({
    dir: EVENTS_DIR,
    xml: EVENTS_XML,
    name,
    description:
      "国内・海外の主要なテックカンファレンスの開催予定と CFP 締切を月次でまとめるレポート",
    copyright: "イベント情報は各主催者・developers.events に帰属します。",
    max: 12,
    date: (page) => {
      const [y, mo] = page.split("-").map(Number);
      return new Date(Date.UTC(y, mo - 1, 1, 22, 45)); // 当月2日 07:45 JST の公開時刻
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
