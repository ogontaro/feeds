const DEEPL_KEY = process.env.DEEPL_API_KEY;
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL;

type Engine = (texts: string[]) => Promise<string[]>;

/** Thrown for DeepL failures that won't fix themselves this run (quota / auth). */
class EngineUnavailable extends Error {}

const passthrough: Engine = async (texts) => texts;

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

/** MyMemory: one string per GET. Anonymous ~5k words/day, more with an email. */
const myMemory: Engine = async (texts) => {
  const out: string[] = [];
  for (const text of texts) {
    const u = new URL("https://api.mymemory.translated.net/get");
    u.searchParams.set("q", text.slice(0, 500));
    u.searchParams.set("langpair", "en|ja");
    if (MYMEMORY_EMAIL) u.searchParams.set("de", MYMEMORY_EMAIL);
    const res = await fetch(u);
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const data = (await res.json()) as { responseData: { translatedText: string } };
    out.push(data.responseData.translatedText || text);
  }
  return out;
};

function pickEngine(): Engine {
  if (DEEPL_KEY) return deepl;
  if (process.env.USE_MYMEMORY) return myMemory;
  console.warn(
    "[translate] no engine configured (DEEPL_API_KEY unset) — passing text through untranslated",
  );
  return passthrough;
}

let engine = pickEngine();
let degraded = false;

/** Translate short EN strings to JA. Order preserved; blank strings skipped. */
export async function translateBatch(texts: string[]): Promise<string[]> {
  const nonEmpty = texts.map((t, i) => [i, t] as const).filter(([, t]) => t.trim() !== "");
  if (nonEmpty.length === 0) return [...texts];

  let translated: string[];
  try {
    translated = await engine(nonEmpty.map(([, t]) => t));
  } catch (err) {
    if (err instanceof EngineUnavailable && !degraded) {
      // Quota/auth failure: publish untranslated for the rest of this run rather than
      // hard-failing every pipeline. New entries pick up translation once the quota resets.
      console.warn(`[translate] engine unavailable (${err.message}) — falling back to passthrough`);
      engine = passthrough;
      degraded = true;
      translated = nonEmpty.map(([, t]) => t);
    } else {
      throw err;
    }
  }

  const result = [...texts];
  nonEmpty.forEach(([idx], k) => {
    result[idx] = translated[k] ?? texts[idx];
  });
  return result;
}

/** True once a permanent engine failure forced passthrough this run. */
export const isDegraded = () => degraded;
