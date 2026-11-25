/**
 * Who runs this instance and where its source lives. Everything here comes from config
 * (Worker vars or environment variables), so a self-hosted copy never shows someone else's name.
 *
 * - SOURCE_URL: the code users are offered under AGPL section 13. Point it at your fork.
 * - OPERATOR_NAME, OPERATOR_URL, OPERATOR_PLACE: shown in the footer and as publisher in the metadata.
 * - BRAND=shiftbloom: the upstream preset (shiftbloom studio wordmark and copy), used by drop.shiftbloom.studio.
 */
export type Brand = {
  sourceUrl: string;
  operator: { name: string; url: string | null; place: string | null } | null;
  /** Render the shiftbloom studio wordmark instead of the operator's name as text. */
  studioWordmark: boolean;
  siteTitle: string;
  description: string;
};

export const UPSTREAM_SOURCE = "https://github.com/shiftbloom-studio/drop";

export type BrandEnv = { BRAND?: string; SOURCE_URL?: string; OPERATOR_NAME?: string; OPERATOR_URL?: string; OPERATOR_PLACE?: string };

const httpUrl = (v: string | undefined) => (v && /^https?:\/\/[^\s"'<>]+$/.test(v.trim()) ? v.trim() : null);
const text = (v: string | undefined, max = 80) => (v && v.trim() ? v.trim().slice(0, max) : null);

export function brandFrom(env: BrandEnv = {}): Brand {
  const sourceUrl = httpUrl(env.SOURCE_URL) ?? UPSTREAM_SOURCE;
  if (env.BRAND === "shiftbloom") {
    return {
      sourceUrl,
      operator: { name: "shiftbloom studio", url: "https://shiftbloom.studio", place: "hamburg" },
      studioWordmark: true,
      siteTitle: "drop. · shiftbloom studio",
      description: "The file host behind shiftbloom studio’s screenshot links. It runs on a single Cloudflare Worker, and the code is on GitHub.",
    };
  }
  const name = text(env.OPERATOR_NAME);
  return {
    sourceUrl,
    operator: name ? { name, url: httpUrl(env.OPERATOR_URL), place: text(env.OPERATOR_PLACE, 40) } : null,
    studioWordmark: false,
    siteTitle: name ? `drop. · ${name}` : "drop.",
    description: "A small file host, pastebin and URL shortener for ShareX and curl. Every upload gets a five-character link, and the code is open source.",
  };
}
