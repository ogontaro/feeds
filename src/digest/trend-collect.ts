import { mkdir } from "node:fs/promises";
import { RELEASE_DOMAINS, REPORT_DOMAINS } from "../lib/config.ts";
import { jstDateString, listPages } from "../lib/digest.ts";
import { parser, toText } from "../lib/feeds.ts";
import { articleBody } from "../lib/html.ts";
import { CACHE, TREND_DIR, TREND_INPUT_MD, releaseDir, reportDir } from "../lib/paths.ts";

/**
 * 業界の潮流を見る外部情報源。種別は三角測量の目安で、数えるかは記事の中身で決める(report-criteria/trend.md)。
 * ニュースは補強のみで種別に数えない。
 * ponytail: 多くのフィードは直近 10〜20 件しか返さないため、更新の多いソースは月初の記事を取りこぼす。
 * 潮流は複数月にわたって繰り返し現れる前提で許容。取りこぼしが問題になったら週次で蓄積する。
 * InfoQ はボット判定(406)で取得できないため入れていない。
 */
const SOURCES = [
  {
    name: "Thoughtworks Insights",
    url: "https://www.thoughtworks.com/rss/insights.xml",
    type: "専門家判定",
  },
  { name: "Martin Fowler", url: "https://martinfowler.com/feed.atom", type: "専門家判定" },
  { name: "Stack Overflow Blog", url: "https://stackoverflow.blog/feed/", type: "定量調査" },
  { name: "JetBrains Blog", url: "https://blog.jetbrains.com/feed/", type: "定量調査" },
  { name: "CNCF Blog", url: "https://www.cncf.io/feed/", type: "定量調査" },
  {
    name: "Linux Foundation Blog",
    url: "https://www.linuxfoundation.org/blog/rss.xml",
    type: "定量調査",
  },
  {
    name: "PlatformEngineering.org",
    url: "https://platformengineering.org/blog/rss.xml",
    type: "定量調査",
  },
  { name: "GitHub Blog", url: "https://github.blog/feed/", type: "実活動データ" },
  {
    name: "The Pragmatic Engineer",
    url: "https://newsletter.pragmaticengineer.com/feed",
    type: "ニュース",
  },
  { name: "Publickey", url: "https://www.publickey1.jp/atom.xml", type: "ニュース" },
  { name: "CodeZine", url: "https://codezine.jp/rss/new/20/index.xml", type: "ニュース" },
] as const;

const SUMMARY_MAX = 600;
const MONTH_RE = /^\d{4}-\d{2}$/;
/** 引数の YYYY-MM、なければ JST の前月(毎月2日に実行する前提)。 */
function targetMonth(): string {
  const arg = process.argv[2];
  if (arg) {
    if (!MONTH_RE.test(arg)) throw new Error(`month must be YYYY-MM: ${arg}`);
    return arg;
  }
  const [y, m] = jstDateString().split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

/** 当月の日次レポート・週次リリースの本文(<article> の中身をテキスト化)。 */
async function monthDigests(month: string) {
  const out: { kind: string; domain: string; date: string; text: string }[] = [];
  const kinds = [
    ["report", REPORT_DOMAINS, reportDir],
    ["release", RELEASE_DOMAINS, releaseDir],
  ] as const;
  for (const [kind, domains, dirOf] of kinds) {
    for (const domain of domains) {
      const dir = dirOf(domain);
      const dates = (await listPages(dir)).filter((d) => d.startsWith(`${month}-`)).reverse();
      for (const date of dates) {
        // リンクは根拠として引用させるので、タグを剥がす前に Markdown 形式で残す
        const withLinks = articleBody(await Bun.file(`${dir}/${date}.html`).text()).replace(
          /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
          "[$2]($1)",
        );
        out.push({ kind, domain, date, text: toText(withLinks) });
      }
    }
  }
  return out;
}

/** 前月までの最新トレンドレポート(前月との差分を書かせるため HTML のまま渡す)。初回は null。 */
async function previousTrend(month: string): Promise<{ month: string; html: string } | null> {
  const prev = (await listPages(TREND_DIR)).find((m) => m < month);
  if (!prev) return null;
  return { month: prev, html: articleBody(await Bun.file(`${TREND_DIR}/${prev}.html`).text()) };
}

async function monthExternal(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1) - 9 * 3_600_000; // JST の月初
  const end = Date.UTC(y, m, 1) - 9 * 3_600_000;
  const items: string[] = [];
  for (const src of SOURCES) {
    let parsed: Awaited<ReturnType<typeof parser.parseURL>>;
    try {
      parsed = await parser.parseURL(src.url);
    } catch (err) {
      console.error(`skip ${src.name}: ${(err as Error).message}`);
      continue;
    }
    for (const it of parsed.items) {
      const t = it.isoDate ? Date.parse(it.isoDate) : Number.NaN;
      if (!(t >= start && t < end)) continue;
      const summary = toText(it.contentSnippet ?? it.content ?? "").slice(0, SUMMARY_MAX);
      items.push(
        `### [${src.type}] ${src.name}: ${(it.title ?? "").trim()}\n` +
          `${new Date(t).toISOString().slice(0, 10)} ${(it.link ?? "").trim()}\n\n${summary}`,
      );
    }
  }
  return items;
}

async function main() {
  const month = targetMonth();
  if (await Bun.file(`${TREND_DIR}/${month}.html`).exists()) {
    console.log(`trend/${month}.html already exists — skip`);
    return;
  }
  const digests = await monthDigests(month);
  const external = await monthExternal(month);
  const previous = await previousTrend(month);

  // JSON だと本文が 1 行に潰れ、Read ツールが長い行を切り詰めるので改行を保った Markdown で渡す
  const md = [
    `# 対象月: ${month}`,
    `## 前回のトレンドレポート: ${previous ? `${previous.month}\n\n${previous.html}` : "なし(初回)"}`,
    "## 当月の日次レポート・週次リリース",
    ...digests.map((d) => `### ${d.kind} / ${d.domain} / ${d.date}\n\n${d.text}`),
    "## 外部情報源",
    ...external,
  ].join("\n\n");
  await mkdir(CACHE, { recursive: true });
  await Bun.write(TREND_INPUT_MD, `${md}\n`);
  console.log(
    `trend-input.md: ${month} digests=${digests.length} external=${external.length} previous=${previous?.month ?? "none"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
