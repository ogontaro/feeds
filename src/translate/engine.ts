const DEEPL_KEY = process.env.DEEPL_API_KEY;
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL;

type Engine = (texts: string[]) => Promise<string[]>;

/** Thrown for engine failures that won't fix themselves this run (quota / auth). */
class EngineUnavailable extends Error {}

const deepl: Engine = async (texts) => {
  const key = DEEPL_KEY as string;
  const endpoint = key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: texts, source_lang: "EN", target_lang: "JA" }),
  });
  if (res.status === 456 || res.status === 401 || res.status === 403) {
    throw new EngineUnavailable(`DeepL ${res.status}: ${await res.text()}`);
  }
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { translations: { text: string }[] };
  return data.translations.map((t) => t.text);
};

/** MyMemory: one string per GET. Anonymous ~5k chars/day, more with an email. */
const myMemory: Engine = async (texts) => {
  const out: string[] = [];
  for (const text of texts) {
    const u = new URL("https://api.mymemory.translated.net/get");
    u.searchParams.set("q", text.slice(0, 500));
    u.searchParams.set("langpair", "en|ja");
    if (MYMEMORY_EMAIL) u.searchParams.set("de", MYMEMORY_EMAIL);
    const res = await fetch(u);
    if (res.status === 429) throw new EngineUnavailable("MyMemory 429: quota finished");
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const data = (await res.json()) as {
      quotaFinished?: boolean;
      responseStatus: number | string;
      responseData: { translatedText: string };
    };
    // 枠切れでも HTTP 200 で警告文を translatedText に入れて返すため、本文として保存しない。
    if (data.quotaFinished || Number(data.responseStatus) === 429) {
      throw new EngineUnavailable(`MyMemory ${data.responseStatus}: quota finished`);
    }
    out.push(data.responseData.translatedText || text);
  }
  return out;
};

/** 先頭から使い、枠切れ／認証エラーで次へ落とす。DeepL の月間枠が尽きても MyMemory の日次枠で翻訳を続ける。 */
function pickEngines(): Engine[] {
  if (DEEPL_KEY) return [deepl, myMemory];
  if (process.env.USE_MYMEMORY) return [myMemory];
  console.warn(
    "[translate] no engine configured (DEEPL_API_KEY unset) — passing text through untranslated",
  );
  return [];
}

const engines = pickEngines();
let degraded = false;

/** True while some engine is still usable this run. */
export const canTranslate = () => engines.length > 0;

/** Translate short EN strings to JA. Order preserved; blank strings skipped. */
export async function translateBatch(texts: string[]): Promise<string[]> {
  const nonEmpty = texts.map((t, i) => [i, t] as const).filter(([, t]) => t.trim() !== "");
  if (nonEmpty.length === 0) return [...texts];

  let translated: string[] | undefined;
  while (!translated && engines.length > 0) {
    try {
      translated = await engines[0](nonEmpty.map(([, t]) => t));
    } catch (err) {
      if (!(err instanceof EngineUnavailable)) throw err;
      // Quota/auth failure: try the next engine, and publish untranslated once none is left
      // rather than hard-failing every pipeline. Untranslated entries are retried later.
      console.warn(`[translate] engine unavailable (${err.message}) — switching engine`);
      engines.shift();
      if (engines.length === 0) degraded = true;
    }
  }
  translated ??= nonEmpty.map(([, t]) => t);

  const result = [...texts];
  nonEmpty.forEach(([idx], k) => {
    result[idx] = translated[k] ?? texts[idx];
  });
  return result;
}

/** True once a permanent engine failure forced passthrough this run. */
export const isDegraded = () => degraded;
