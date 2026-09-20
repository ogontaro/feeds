import { mkdir } from "node:fs/promises";
import { loadFeeds } from "./lib/config.ts";
import { ADOPTION_LOG, CACHE, FEED_AUDIT_INPUT_JSON, STARRED_LOG } from "./lib/paths.ts";

const STALE_DAYS = 56; // 8 weeks

async function mergeLatestByName(lastAdopted: Map<string, string>, path: string): Promise<void> {
  const text = await Bun.file(path)
    .text()
    .catch(() => "");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const { date, sourceName } = JSON.parse(line) as { date: string; sourceName: string };
    const prev = lastAdopted.get(sourceName);
    if (!prev || date > prev) lastAdopted.set(sourceName, date);
  }
}

/** Merges report/release adoptions and Inoreader stars — both count as "this feed matters". */
async function lastAdoptedByName(): Promise<Map<string, string>> {
  const lastAdopted = new Map<string, string>();
  await mergeLatestByName(lastAdopted, ADOPTION_LOG);
  await mergeLatestByName(lastAdopted, STARRED_LOG);
  return lastAdopted;
}

async function main() {
  const feeds = await loadFeeds();
  const lastAdopted = await lastAdoptedByName();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Release feeds track a project's own release cadence, not reader attention —
  // a project with no new release isn't "stale", so only content feeds are audited.
  const staleCandidates = feeds
    .filter((f) => f.enabled !== false && f.kind === "content")
    .map((f) => ({ ...f, lastAdoptedAt: lastAdopted.get(f.name) ?? f.addedAt ?? null }))
    .filter((f) => !f.lastAdoptedAt || f.lastAdoptedAt < cutoffStr);

  await mkdir(CACHE, { recursive: true });
  await Bun.write(
    FEED_AUDIT_INPUT_JSON,
    JSON.stringify({ staleCandidates, staleDays: STALE_DAYS }, null, 2),
  );
  console.log(`feed-audit-input.json: ${staleCandidates.length} stale candidate(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
