import Parser from "rss-parser";
import { SECURITY_INPUT_JSON, SECURITY_INPUT_MD, SECURITY_LOG } from "../lib/paths.ts";

/**
 * 3時間ごとのセキュリティチェック入力。新規の Critical CVE / 悪用確認済み(KEV) /
 * Kubernetes 公式アドバイザリを集め、AI が緊急度を判定できる形にする。
 * 既に処理した ID は security-alerts.ndjson で除外する(KEV に昇格したものは再通知)。
 */

const WINDOW_HOURS = 24;
const KEV_WINDOW_DAYS = 7;
const MAX_ITEMS = 120;
const K8S_CVE_FEED =
  "https://kubernetes.io/docs/reference/issues-security/official-cve-feed/feed.xml";
const NVD_API = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const KEV_JSON =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const EPSS_API = "https://api.first.org/data/v1/epss";
const GH_ADVISORIES = "https://api.github.com/advisories";

type Item = {
  id: string;
  title: string;
  summary: string;
  published: string | null;
  cvss: number | null;
  epss: number | null;
  epssPercentile: number | null;
  kev: boolean;
  kevDate: string | null;
  kevAction: string | null;
  sources: string[];
  packages: string[];
  link: string;
};

type LogEntry = { id: string; kev?: boolean };

type NvdVulnerability = {
  cve?: {
    id?: string;
    published?: string;
    descriptions?: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV40?: Array<{ cvssData?: { baseScore?: number } }>;
      cvssMetricV31?: Array<{ cvssData?: { baseScore?: number } }>;
      cvssMetricV30?: Array<{ cvssData?: { baseScore?: number } }>;
      cvssMetricV2?: Array<{ cvssData?: { baseScore?: number } }>;
    };
  };
};

type GhsaAdvisory = {
  ghsa_id?: string;
  cve_id?: string;
  summary?: string;
  published_at?: string;
  html_url?: string;
  cvss?: { score?: number };
  vulnerabilities?: Array<{ package?: { name?: string } }>;
};

type KevEntry = {
  cveID?: string;
  vulnerabilityName?: string;
  shortDescription?: string;
  dateAdded?: string;
  requiredAction?: string;
};

const now = new Date();
const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000);

async function get(url: string, init?: RequestInit, retries = 0): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
    if (res.ok) return res;
    if (attempt >= retries || (res.status !== 429 && res.status < 500)) {
      throw new Error(`${res.status} ${url}`);
    }
    await Bun.sleep(30_000);
  }
}

const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const firstSentences = (s: string, max = 600): string => {
  const text = stripHtml(s);
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

async function loadSeen(): Promise<Map<string, LogEntry>> {
  const text = await Bun.file(SECURITY_LOG)
    .text()
    .catch(() => "");
  const seen = new Map<string, LogEntry>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.id) seen.set(entry.id, entry);
    } catch {
      // 壊れた行は無視する。次回以降の ID で作り直される。
    }
  }
  return seen;
}

function add(items: Map<string, Item>, next: Item): void {
  const cur = items.get(next.id);
  if (!cur) {
    items.set(next.id, next);
    return;
  }
  // 複数ソースの同じ CVE を1件にまとめる。情報は欠けている項目だけ補う。
  cur.title = cur.title || next.title;
  cur.summary = cur.summary.length >= next.summary.length ? cur.summary : next.summary;
  cur.published ??= next.published;
  cur.cvss ??= next.cvss;
  cur.kev ||= next.kev;
  cur.kevDate ??= next.kevDate;
  cur.kevAction ??= next.kevAction;
  cur.link = cur.link || next.link;
  for (const s of next.sources) if (!cur.sources.includes(s)) cur.sources.push(s);
  for (const p of next.packages) if (!cur.packages.includes(p)) cur.packages.push(p);
}

async function collectNvd(): Promise<Map<string, Item>> {
  const items = new Map<string, Item>();
  const params = new URLSearchParams({
    pubStartDate: since.toISOString(),
    pubEndDate: now.toISOString(),
    cvssV3Severity: "CRITICAL",
    resultsPerPage: "2000",
  });
  const res = await get(
    `${NVD_API}?${params}`,
    {
      headers: { "User-Agent": "ogontaro-feeds-security" },
    },
    1,
  );
  const body = (await res.json()) as {
    totalResults?: number;
    vulnerabilities?: NvdVulnerability[];
  };
  if ((body.totalResults ?? 0) > 2000) {
    console.warn(
      `::warning::NVD returned ${body.totalResults} results; only the first 2000 are used`,
    );
  }
  for (const v of body.vulnerabilities ?? []) {
    const cve = v.cve ?? {};
    if (!cve.id) continue;
    const m = cve.metrics ?? {};
    const cvss =
      m.cvssMetricV40?.[0]?.cvssData?.baseScore ??
      m.cvssMetricV31?.[0]?.cvssData?.baseScore ??
      m.cvssMetricV30?.[0]?.cvssData?.baseScore ??
      m.cvssMetricV2?.[0]?.cvssData?.baseScore ??
      null;
    const description = (cve.descriptions ?? []).find((d) => d.lang === "en")?.value ?? "";
    add(items, {
      id: cve.id,
      title: cve.id,
      summary: firstSentences(description),
      published: cve.published ?? null,
      cvss: typeof cvss === "number" ? cvss : null,
      epss: null,
      epssPercentile: null,
      kev: false,
      kevDate: null,
      kevAction: null,
      sources: ["NVD"],
      packages: [],
      link: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
    });
  }
  return items;
}

async function collectGhsa(token: string | undefined): Promise<Map<string, Item>> {
  const items = new Map<string, Item>();
  const params = new URLSearchParams({
    severity: "critical",
    published: `${since.toISOString().slice(0, 10)}..${now.toISOString().slice(0, 10)}`,
    per_page: "100",
  });
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ogontaro-feeds-security",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await get(`${GH_ADVISORIES}?${params}`, { headers });
  const arr = (await res.json()) as GhsaAdvisory[];
  for (const a of arr) {
    const id = a.cve_id ?? a.ghsa_id;
    if (!id) continue;
    add(items, {
      id,
      title: a.summary ?? id,
      summary: firstSentences(a.summary ?? ""),
      published: a.published_at ?? null,
      cvss: typeof a.cvss?.score === "number" ? a.cvss.score : null,
      epss: null,
      epssPercentile: null,
      kev: false,
      kevDate: null,
      kevAction: null,
      sources: ["GitHub Advisory"],
      packages: (a.vulnerabilities ?? [])
        .map((v) => v.package?.name)
        .filter((p: unknown): p is string => typeof p === "string"),
      link: a.html_url ?? `https://github.com/advisories/${a.ghsa_id}`,
    });
  }
  return items;
}

async function collectKev(items: Map<string, Item>): Promise<void> {
  const res = await get(KEV_JSON, { headers: { "User-Agent": "ogontaro-feeds-security" } });
  const body = (await res.json()) as {
    vulnerabilities?: KevEntry[];
  };
  const kevCutoff = new Date(now.getTime() - KEV_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const byId = new Map<string, KevEntry>();
  for (const v of body.vulnerabilities ?? []) {
    if (v.cveID) byId.set(v.cveID, v);
  }
  // 収集済みの CVE に KEV フラグを付ける。
  for (const item of items.values()) {
    const v = byId.get(item.id);
    if (!v) continue;
    item.kev = true;
    item.kevDate = v.dateAdded ?? null;
    item.kevAction = v.requiredAction ?? null;
    if (!item.sources.includes("CISA KEV")) item.sources.push("CISA KEV");
  }
  // Critical の窓から外れた古い CVE でも、直近に KEV 入りしたものは拾う。
  for (const v of byId.values()) {
    if (!v.cveID || !v.dateAdded || v.dateAdded < kevCutoff) continue;
    add(items, {
      id: v.cveID,
      title: v.vulnerabilityName ?? v.cveID,
      summary: firstSentences(v.shortDescription ?? ""),
      published: null,
      cvss: null,
      epss: null,
      epssPercentile: null,
      kev: true,
      kevDate: v.dateAdded ?? null,
      kevAction: v.requiredAction ?? null,
      sources: ["CISA KEV"],
      packages: [],
      link: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
    });
  }
}

async function collectKubernetes(items: Map<string, Item>): Promise<void> {
  const res = await get(K8S_CVE_FEED, { headers: { "User-Agent": "ogontaro-feeds-security" } });
  const feed = await new Parser().parseString(await res.text());
  for (const entry of feed.items) {
    const id = entry.title?.match(/CVE-\d{4}-\d{4,}/)?.[0];
    if (!id) continue;
    const published = entry.pubDate ? new Date(entry.pubDate) : null;
    if (published && published < since) continue;
    add(items, {
      id,
      title: id,
      summary: firstSentences(entry.contentSnippet ?? entry.content ?? entry.title ?? ""),
      published: published?.toISOString() ?? null,
      cvss: null,
      epss: null,
      epssPercentile: null,
      kev: false,
      kevDate: null,
      kevAction: null,
      sources: ["Kubernetes 公式"],
      packages: ["kubernetes"],
      link: entry.link ?? K8S_CVE_FEED,
    });
  }
}

async function addEpss(items: Map<string, Item>): Promise<void> {
  const cves = [...items.keys()].filter((id) => id.startsWith("CVE-"));
  for (let i = 0; i < cves.length; i += 100) {
    const chunk = cves.slice(i, i + 100);
    const params = new URLSearchParams({ cve: chunk.join(",") });
    const res = await get(`${EPSS_API}?${params}`, {
      headers: { "User-Agent": "ogontaro-feeds-security" },
    });
    const body = (await res.json()) as {
      data?: Array<{ cve: string; epss: string; percentile: string }>;
    };
    for (const row of body.data ?? []) {
      const item = items.get(row.cve);
      if (!item) continue;
      item.epss = Number(row.epss);
      item.epssPercentile = Number(row.percentile);
    }
  }
}

const kevLabel = (item: Item): string =>
  item.kev ? `あり（${item.kevDate ?? "日付不明"} 追加）` : "なし";

function toMarkdown(items: Item[]): string {
  const lines = [
    `# セキュリティチェック入力 — ${now.toISOString()} (UTC)`,
    "",
    `新規 ${items.length} 件。NVD の Critical CVE、GitHub Advisory、CISA KEV、Kubernetes 公式の直近 ${WINDOW_HOURS} 時間分です。`,
    "既に通知済みの ID は除いてあります。KEV に昇格したものは再掲しています。",
    "",
  ];
  items.forEach((item, i) => {
    lines.push(
      `## ${i + 1}. ${item.id}`,
      `- タイトル: ${item.title}`,
      `- 初公開: ${item.published ?? "不明"}`,
      `- CVSS: ${item.cvss ?? "不明"}`,
      `- EPSS: ${
        item.epss === null
          ? "不明"
          : `${item.epss.toFixed(3)}（percentile ${item.epssPercentile?.toFixed(3) ?? "不明"}）`
      }`,
      `- CISA KEV: ${kevLabel(item)}`,
      ...(item.kevAction ? [`- KEV 推奨対応: ${item.kevAction.slice(0, 300)}`] : []),
      `- 情報源: ${item.sources.join(", ")}`,
      ...(item.packages.length > 0 ? [`- 影響パッケージ: ${item.packages.join(", ")}`] : []),
      `- 概要: ${item.summary || "なし"}`,
      `- リンク: ${item.link}`,
      "",
    );
  });
  return lines.join("\n");
}

async function main() {
  const seen = await loadSeen();
  const items = new Map<string, Item>();
  let succeeded = 0;

  for (const [name, run] of [
    ["NVD", () => collectNvd()],
    ["GitHub Advisory", () => collectGhsa(process.env.GITHUB_TOKEN)],
  ] as const) {
    try {
      const collected = await run();
      for (const item of collected.values()) add(items, item);
      succeeded++;
    } catch (err) {
      console.warn(`::warning::${name} の取得に失敗: ${(err as Error).message}`);
    }
  }

  for (const [name, run] of [
    ["CISA KEV", () => collectKev(items)],
    ["Kubernetes 公式", () => collectKubernetes(items)],
  ] as const) {
    try {
      await run();
      succeeded++;
    } catch (err) {
      console.warn(`::warning::${name} の取得に失敗: ${(err as Error).message}`);
    }
  }

  if (succeeded === 0) {
    throw new Error("all security sources failed");
  }

  try {
    await addEpss(items);
  } catch (err) {
    console.warn(`::warning::EPSS の取得に失敗: ${(err as Error).message}`);
  }

  const fresh = [...items.values()]
    .filter((item) => {
      const prev = seen.get(item.id);
      if (!prev) return true;
      return item.kev && !prev.kev; // 通知済みでも悪用確認済みになったら再通知
    })
    .sort(
      (a, b) =>
        Number(b.kev) - Number(a.kev) ||
        (b.epss ?? 0) - (a.epss ?? 0) ||
        (b.cvss ?? 0) - (a.cvss ?? 0),
    )
    .slice(0, MAX_ITEMS);

  await Bun.write(SECURITY_INPUT_JSON, JSON.stringify({ generatedAt: now, items: fresh }, null, 2));
  await Bun.write(SECURITY_INPUT_MD, toMarkdown(fresh));
  console.log(`security-input.md: ${fresh.length} items (${items.size} collected)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
