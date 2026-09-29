import { parse } from "yaml";
import { LANDSCAPE_YAML } from "./paths.ts";

export const QUADRANTS = ["ai", "platform", "practice", "ops"] as const;
export const RINGS = ["adopt", "trial", "assess", "hold"] as const;
export const INTERESTS = ["high", "low"] as const;
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

export type LandscapeItem = {
  name: string;
  quadrant: Quadrant;
  ring: Ring;
  interest: (typeof INTERESTS)[number];
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
  focus: Record<Quadrant, string>;
  changes: string[];
  items: LandscapeItem[];
};

export async function loadLandscape(): Promise<Landscape> {
  return parse(await Bun.file(LANDSCAPE_YAML).text()) as Landscape;
}
