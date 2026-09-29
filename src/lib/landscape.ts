import { parse } from "yaml";
import { INTERESTS_YAML, LANDSCAPE_YAML } from "./paths.ts";

export const QUADRANTS = ["ai", "platform", "practice", "ops"] as const;
export const RINGS = ["adopt", "trial", "assess", "hold"] as const;
export const TRENDS = ["new", "up", "stable", "down"] as const;

export type Quadrant = (typeof QUADRANTS)[number];
export type Ring = (typeof RINGS)[number];
export type Trend = (typeof TRENDS)[number];

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  ai: "AI / エージェント",
  platform: "プラットフォーム",
  practice: "開発手法",
  ops: "運用 / セキュリティ",
};
export const RING_LABEL: Record<Ring, string> = {
  adopt: "Adopt",
  trial: "Trial",
  assess: "Assess",
  hold: "Hold",
};

export const RING_DESC: Record<Ring, string> = {
  adopt: "中心となるツールをすでに使っている",
  trial: "使っているツールの延長で試せる",
  assess: "関心には合うが、まだ調べる段階",
  hold: "衰退・リスクの指摘があるか、環境に合わないので見送る",
};

export type LandscapeItem = {
  name: string;
  /** その技術が何か(1 文) */
  summary: string;
  quadrant: Quadrant;
  ring: Ring;
  reason: string;
  /** ランドスケープに初めて載った月 */
  since: string;
  /** 月次トレンドで最後に取り上げられた月。未言及なら null */
  lastCited: string | null;
  /** スクリプトが計算する(AI には書かせない) */
  trend: Trend;
};

export type Landscape = {
  updated: string;
  changes: string[];
  items: LandscapeItem[];
};

export async function loadLandscape(): Promise<Landscape> {
  return parse(await Bun.file(LANDSCAPE_YAML).text()) as Landscape;
}

/** interests.yaml の landscape 節(人が書く)。items は landscape.yaml の name と完全一致させる */
export type LandscapeInterests = Record<Quadrant, { focus: string; items: string[] }>;

export async function loadLandscapeInterests(): Promise<LandscapeInterests> {
  const parsed = parse(await Bun.file(INTERESTS_YAML).text());
  return parsed?.landscape ?? ({} as LandscapeInterests);
}

/** 項目名からファイル名を作る(詳細ページ用)。英数字・かな・漢字以外は "-" にまとめる */
export const slugOf = (name: string) => name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
