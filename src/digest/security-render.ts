import { appendFile, rm } from "node:fs/promises";
import { relative } from "node:path";
import { Feed as FeedGen } from "feed";
import { readClaudeOutput, writePage } from "../lib/digest.ts";
import { articleBody, escapeHtml, pageShell } from "../lib/html.ts";
import {
  DOCS,
  SECURITY_DIR,
  SECURITY_INPUT_JSON,
  SECURITY_LOG,
  SECURITY_OUTPUT_JSON,
  SECURITY_XML,
  SITE_URL,
} from "../lib/paths.ts";

/**
 * AI が判定したセキュリティアラートをページ・RSS・処理済みログに反映する。
 * 通知しなかった ID もログに残し、次回以降の入力から除外する(KEV 昇格時は collect が再掲する)。
 */

const RETENTION_DAYS = 90;
const FEED_ITEMS = 60;
const INDEX_ITEMS = 200;
const URGENCIES = ["immediate", "week", "watch"] as const;
type Urgency = (typeof URGENCIES)[number];

const URGENCY_LABEL: Record<Urgency, string> = {
  immediate: "即時対応",
  week: "今週中",
  watch: "監視",
};

type InputItem = {
  id: string;
  link: string;
  kev: boolean;
};

type Alert = {
  id: string;
  title: string;
  urgency: Urgency;
  summary: string;
  reason: string;
  action: string;
  components: string[];
};

type LogEntry = {
  date: string;
  id: string;
  kev: boolean;
  reported: boolean;
  title?: string;
  urgency?: Urgency;
};

const pagePath = (id: string) => `${SECURITY_DIR}/${id}.html`;
const pageUrl = (id: string) => `${SITE_URL}/digest/security/${id}.html`;

const stripFence = (s: string): string =>
  s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

function parseAlerts(raw: string, input: Map<string, InputItem>): Alert[] {
  const parsed = JSON.parse(stripFence(raw)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("security.json must be an array");

  const alerts: Alert[] = [];
  for (const value of parsed) {
    const a = value as Record<string, unknown>;
    const id = typeof a.id === "string" ? a.id : "";
    if (!input.has(id)) {
      console.warn(`::warning::security.json: unknown id dropped: ${id || "(empty)"}`);
      continue;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`unsafe alert id: ${id}`);
    if (typeof a.title !== "string" || !a.title.trim()) {
      throw new Error(`security.json: ${id} has no title`);
    }
    const urgency = URGENCIES.includes(a.urgency as Urgency) ? (a.urgency as Urgency) : "watch";
    if (urgency !== a.urgency) {
      console.warn(`::warning::security.json: ${id} has unknown urgency; treating as watch`);
    }
    alerts.push({
      id,
      title: a.title.trim(),
      urgency,
      summary: typeof a.summary === "string" ? a.summary.trim() : "",
      reason: typeof a.reason === "string" ? a.reason.trim() : "",
      action: typeof a.action === "string" ? a.action.trim() : "",
      components: Array.isArray(a.components)
        ? a.components.filter((c): c is string => typeof c === "string")
        : [],
    });
  }
  return alerts;
}

function alertMarkdown(alert: Alert, link: string): string {
  const components =
    alert.components.length > 0 ? alert.components.join(", ") : "該当なし（広く使われる製品）";
  return [
    `### ${alert.title}`,
    `**緊急度: ${URGENCY_LABEL[alert.urgency]}**${alert.reason ? ` — ${alert.reason}` : ""}`,
    "",
    alert.summary,
    "",
    `**自宅インフラへの該当:** ${components}`,
    `**推奨アクション:** ${alert.action || "ベンダーのアドバイザリを確認する"}`,
    "",
    `[元情報](${link})`,
  ].join("\n");
}

async function loadLog(): Promise<LogEntry[]> {
  const text = await Bun.file(SECURITY_LOG)
    .text()
    .catch(() => "");
  const entries: LogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.id && entry.date) entries.push(entry);
    } catch {
      // 壊れた行は無視する。
    }
  }
  return entries;
}

/** 同じ ID は最新の「通知した」エントリだけを残す。 */
function latestReported(entries: LogEntry[]): Map<string, LogEntry> {
  const latest = new Map<string, LogEntry>();
  for (const entry of entries) {
    if (!entry.reported) continue;
    const cur = latest.get(entry.id);
    if (!cur || entry.date > cur.date) latest.set(entry.id, entry);
  }
  return latest;
}

async function writeIndex(reported: LogEntry[]): Promise<void> {
  const rows = reported
    .slice(0, INDEX_ITEMS)
    .map(
      (e) =>
        `<li><time>${escapeHtml(e.date.replace("T", " ").slice(0, 16))}</time> ` +
        `<strong>${escapeHtml(URGENCY_LABEL[e.urgency ?? "watch"])}</strong> ` +
        `<a href="${encodeURIComponent(e.id)}.html">${escapeHtml(e.id)}</a> ${escapeHtml(e.title ?? "")}</li>`,
    )
    .join("\n");
  const depth = relative(DOCS, SECURITY_DIR).split("/").length;
  await Bun.write(
    `${SECURITY_DIR}/index.html`,
    pageShell({
      title: "セキュリティアラート 過去の一覧",
      body: `<h1>セキュリティアラート 過去の一覧</h1>
<p class="muted">3時間ごとに、新しく公表された Critical CVE・実際に悪用されている(KEV)脆弱性・自宅インフラのアドバイザリを Claude が判定したものです。</p>
<ul>
${rows}
</ul>`,
      depth,
    }),
  );
}

async function prune(reported: Map<string, LogEntry>, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  for (const entry of reported.values()) {
    if (entry.date < cutoff) await rm(pagePath(entry.id), { force: true });
  }
}

async function writeFeed(reported: LogEntry[]): Promise<void> {
  const items = reported.filter((e) => e.title && e.urgency).slice(0, FEED_ITEMS);
  if (items.length === 0) return;

  const feed = new FeedGen({
    title: "セキュリティアラート — ogontaro/feeds",
    description:
      "3時間ごとの Critical CVE・悪用確認済み(KEV)・自宅インフラ関連アドバイザリの判定。緊急度と推奨アクション付き。",
    id: `${SITE_URL}/digest/security.xml`,
    link: `${SITE_URL}/`,
    language: "ja",
    copyright: "各アドバイザリの著作権は原著者に帰属します。",
    updated: new Date(),
  });
  for (const entry of items) {
    const html = await Bun.file(pagePath(entry.id))
      .text()
      .catch(() => "");
    if (!html) continue;
    feed.addItem({
      title: `[${URGENCY_LABEL[entry.urgency ?? "watch"]}] ${entry.title}`,
      id: `${pageUrl(entry.id)}#${entry.date}`,
      link: pageUrl(entry.id),
      date: new Date(entry.date),
      content: articleBody(html),
    });
  }
  await Bun.write(SECURITY_XML, feed.rss2());
  console.log(`security.xml: ${items.length} items`);
}

async function main() {
  const input = (await Bun.file(SECURITY_INPUT_JSON).json()) as { items?: InputItem[] };
  const items = input.items ?? [];
  if (items.length === 0) {
    console.log("security-input.json is empty — nothing to render");
    return;
  }
  const inputById = new Map(items.map((item) => [item.id, item]));

  const raw = await readClaudeOutput(SECURITY_OUTPUT_JSON);
  const alerts = parseAlerts(raw, inputById);
  const alertById = new Map(alerts.map((alert) => [alert.id, alert]));

  const now = new Date();
  for (const alert of alerts) {
    await writePage(
      SECURITY_DIR,
      alert.id,
      "セキュリティアラート",
      alertMarkdown(alert, inputById.get(alert.id)?.link ?? ""),
    );
  }

  const date = now.toISOString();
  const lines = items.map((item) => {
    const alert = alertById.get(item.id);
    const entry: LogEntry = {
      date,
      id: item.id,
      kev: item.kev,
      reported: Boolean(alert),
      ...(alert ? { title: alert.title, urgency: alert.urgency } : {}),
    };
    return `${JSON.stringify(entry)}\n`;
  });
  await appendFile(SECURITY_LOG, lines.join(""));
  console.log(
    `security-alerts.ndjson: ${alerts.length} reported / ${items.length - alerts.length} skipped`,
  );

  const reported = [...latestReported(await loadLog()).values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  await writeFeed(reported);
  if (reported.length > 0) await writeIndex(reported);
  await prune(new Map(reported.map((entry) => [entry.id, entry])), now);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
