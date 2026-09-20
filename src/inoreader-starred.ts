import { appendFile } from "node:fs/promises";
import { STARRED_LOG } from "./lib/paths.ts";

const TOKEN_URL = "https://www.inoreader.com/oauth2/token";
const STARRED_URL =
  "https://www.inoreader.com/reader/api/0/stream/contents/user/-/state/com.google/starred";

type StarredItem = {
  canonical?: { href: string }[];
  origin?: { title?: string };
};

async function refreshAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.INOREADER_CLIENT_ID ?? "",
      client_secret: process.env.INOREADER_CLIENT_SECRET ?? "",
      refresh_token: process.env.INOREADER_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Inoreader token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function main() {
  // Secrets not set up yet (OAuth app registration is a manual, one-time step) —
  // skip quietly rather than failing the workflow.
  if (!process.env.INOREADER_REFRESH_TOKEN) {
    console.log("INOREADER_REFRESH_TOKEN not set, skipping starred sync");
    return;
  }

  const token = await refreshAccessToken();
  const res = await fetch(STARRED_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Inoreader starred fetch failed: ${res.status}`);
  const json = (await res.json()) as { items?: StarredItem[] };

  const date = new Date().toISOString().slice(0, 10);
  const lines = (json.items ?? [])
    .map((item) => {
      const link = item.canonical?.[0]?.href;
      const sourceName = item.origin?.title;
      if (!link || !sourceName) return null;
      return `${JSON.stringify({ date, sourceName, link })}\n`;
    })
    .filter((l): l is string => l !== null);

  await appendFile(STARRED_LOG, lines.join(""));
  console.log(`starred-log.ndjson: recorded ${lines.length} starred item(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
