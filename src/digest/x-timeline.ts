import { mkdir } from "node:fs/promises";
import Parser from "rss-parser";
import { CACHE, X_TIMELINE_JSON, reportInputJson } from "../lib/paths.ts";

/**
 * X ホームタイムライン(RSSHub `twitter/home_latest` と `twitter/home`)を蓄積し、日次レポートの入力を書き出す。
 * 1 回の取得は 88 件(平日日中は ~8 時間ぶん)しか返らないため、timeline.yml が 2 時間ごとに取得して
 * actions/cache 上の蓄積(.cache/x-timeline.json)にマージし、report.yml が直近 24h を読む。
 * 「直近」は投稿時刻ではなく初めて取得した時刻(seen)で判定する。おすすめ(home)は数日前の投稿も
 * 出すため、投稿時刻で切ると一度もレポートに載らない。
 *
 * public リポジトリの公開ログに流れるため、本文・投稿者・URL は出力せず件数だけ出す。
 * RSSHUB_ACCESS_KEY 未設定なら何もせず空の入力を書いて正常終了する。
 * 取得できたルートの分は必ず蓄積に書き込み、そのうえで --strict(timeline.yml)なら失敗を異常終了で知らせる。
 */

const RETENTION_MS = 7 * 24 * 3_600_000;
const WINDOW_MS = 24 * 3_600_000;
const MAX_TEXT = 1000;
const OWN_HOSTS = /(^|\.)(x\.com|twitter\.com|twimg\.com)$/;

type Post = {
  guid: string;
  link: string;
  author: string;
  text: string;
  links: string[];
  published: string;
  /** 初めて取得した時刻。24h 窓と 7 日保持の基準。 */
  seen: string;
};

const strict = process.argv.includes("--strict");

/**
 * home_latest = フォロー中(時系列。取りこぼさないための主系)、home = おすすめ(フォロー外の話題も入る。
 * 取得ごとに中身が変わり網羅はできない)。ルートを増やすほど cookie 経由の上流アクセスが増える。
 */
const RSSHUB = "https://rsshub.lab.ogontaro.com";
const ROUTES = ["twitter/home_latest", "twitter/home"];

/** ポスト本文中の外部 URL(画像・動画・X 自身のリンクは除く)。 */
function externalLinks(html: string): string[] {
  const urls = [...html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
  return [
    ...new Set(
      urls.filter((u) => {
        try {
          return !OWN_HOSTS.test(new URL(u).hostname);
        } catch {
          return false;
        }
      }),
    ),
  ];
}

function toText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
}

/** RSSHub は cookie 周りで一時的に 503 を返すことがある(再試行で 200)。5xx と通信エラーだけ再試行する。 */
async function fetchWithRetry(url: string): Promise<Omit<Post, "seen">[]> {
  for (const waitMs of [30_000, 60_000]) {
    try {
      return await fetchTimeline(url);
    } catch (err) {
      if (!/HTTP 5\d\d|fetch failed: (?!HTTP)/.test((err as Error).message)) throw err;
      await Bun.sleep(waitMs);
    }
  }
  return fetchTimeline(url);
}

/** 取得失敗時もメッセージに URL(アクセスキー)を含めない。 */
async function fetchTimeline(url: string): Promise<Omit<Post, "seen">[]> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new Error(`timeline fetch failed: ${(err as Error).name}`);
  }
  // RSSHub のエラーページには認証トークンの一部が載るため、本文・ヘッダは一切出さない。
  if (!res.ok) throw new Error(`timeline fetch failed: HTTP ${res.status}`);
  let parsed: Awaited<ReturnType<Parser["parseString"]>>;
  try {
    parsed = await new Parser().parseString(await res.text());
  } catch {
    throw new Error("timeline parse failed");
  }
  return parsed.items.flatMap((item) => {
    const link = (item.link ?? "").trim();
    if (!link) return [];
    const html = item.content ?? "";
    return [
      {
        guid: (item.guid ?? link).trim(),
        link,
        // 表示名ではなく URL 上のハンドル(公開の帰属表示)だけ持つ。
        author: `@${new URL(link).pathname.split("/")[1] ?? ""}`,
        text: toText(html),
        links: externalLinks(html),
        published: item.isoDate ?? new Date().toISOString(),
      },
    ];
  });
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const key = process.env.RSSHUB_ACCESS_KEY ?? "";
  if (!key) {
    await Bun.write(reportInputJson("x"), "[]");
    console.log("RSSHUB_ACCESS_KEY not set — skip");
    return;
  }

  const stored: Post[] = await Bun.file(X_TIMELINE_JSON)
    .json()
    .catch(() => []);
  const fetched: Omit<Post, "seen">[] = [];
  const failed: string[] = [];
  const storedGuids = new Set(stored.map((p) => p.guid));
  for (const route of ROUTES) {
    try {
      const got = await fetchWithRetry(`${RSSHUB}/${route}?key=${encodeURIComponent(key)}`);
      fetched.push(...got);
      // 時系列の home_latest が前回の蓄積と 1 件も重ならなければ、その間のポストを取りこぼしている。
      if (route === "twitter/home_latest" && storedGuids.size > 0) {
        const overlap = got.filter((p) => storedGuids.has(p.guid)).length;
        console.log(`${route}: overlap with stored ${overlap}/${got.length}`);
        if (overlap === 0)
          console.log(`::warning::${route}: no overlap — posts were likely missed`);
      }
    } catch (err) {
      console.error(`${route}: ${(err as Error).message}`);
      failed.push(route);
    }
  }

  const now = Date.now();
  const byGuid = new Map(stored.map((p) => [p.guid, p]));
  const added = new Set(fetched.map((p) => p.guid).filter((g) => !byGuid.has(g))).size;
  for (const p of fetched) {
    byGuid.set(p.guid, { ...p, seen: byGuid.get(p.guid)?.seen ?? new Date(now).toISOString() });
  }
  const posts = [...byGuid.values()]
    .filter((p) => now - Date.parse(p.seen) < RETENTION_MS)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  await Bun.write(X_TIMELINE_JSON, JSON.stringify(posts));

  const recent = posts
    .filter((p) => now - Date.parse(p.seen) < WINDOW_MS)
    .map(({ guid: _, seen: __, ...p }) => p);
  await Bun.write(reportInputJson("x"), JSON.stringify(recent, null, 2));
  console.log(
    `x-timeline: fetched ${fetched.length} (${added} new), stored ${posts.length} (7d), report-x-input.json ${recent.length} (24h)`,
  );
  if (failed.length > 0 && strict) process.exit(1);
}

main().catch((err) => {
  // err オブジェクトごと出すとスタックや付帯情報に URL が混ざりうるので message だけ。
  console.error((err as Error).message);
  process.exit(1);
});
