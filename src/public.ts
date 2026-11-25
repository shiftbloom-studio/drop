/**
 * Public uploads: visitors without a token may upload files and pastes when the operator turns it on
 * (PUBLIC_UPLOADS=on plus both Turnstile keys). Every public item is deleted after 12 hours at the
 * latest, each upload needs a fresh Turnstile check, and uploads are capped per IP address: per minute
 * by a rate limiter and per day by a counter in D1 that only ever sees a keyed hash of the address.
 * Pure helpers here; the routes live in index.ts.
 */
import { INLINE_TYPES } from "./safety";
import { sha256Hex } from "./util";

/** Owner recorded for items uploaded without a token. No token's history ever includes them. */
export const PUBLIC_OWNER = "public";
/** Public items live under their own R2 prefix, so a bucket lifecycle rule can back up the hourly cleanup. */
export const PUBLIC_PREFIX = "pub/";
/** The longest a public item may live. */
export const PUBLIC_MAX_SECONDS = 12 * 3600;
/** Expiry choices offered without a token. Anything else (including "never") becomes 12 hours. */
export const PUBLIC_EXPIRY: Record<string, number> = { "10m": 600, "1h": 3600, "12h": PUBLIC_MAX_SECONDS };
/** Held back until the background scan has run; the link answers "still checking" meanwhile. */
export const CHECKING = "checking";
/** Placed on a public image whose sensitive content check didn't produce an answer. Only the operator can release it. */
export const NOT_CHECKED = "not checked";
/** Length of public item ids. With 57 characters that is about 58 bits: links work only for whoever has them. */
export const PUBLIC_ID_LENGTH = 10;
/** Turnstile action the public upload widget runs with. */
export const PUBLIC_ACTION = "public-upload";

export type PublicEnv = {
  PUBLIC_UPLOADS?: string;
  PUBLIC_MAX_MB?: string;
  PUBLIC_PASTE_KB?: string;
  PUBLIC_DAILY_UPLOADS?: string;
  PUBLIC_DAILY_MB?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
};

export type PublicLimits = { maxBytes: number; pasteBytes: number; dailyUploads: number; dailyBytes: number };

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Public uploads are on only when the operator asks for it and Turnstile is configured. */
export const publicEnabled = (env: PublicEnv) => /^(on|1|true|yes)$/i.test(env.PUBLIC_UPLOADS || "") && !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);

export function publicLimits(env: PublicEnv): PublicLimits {
  return {
    maxBytes: num(env.PUBLIC_MAX_MB, 25) * 1024 * 1024,
    pasteBytes: num(env.PUBLIC_PASTE_KB, 512) * 1024,
    dailyUploads: num(env.PUBLIC_DAILY_UPLOADS, 30),
    dailyBytes: num(env.PUBLIC_DAILY_MB, 200) * 1024 * 1024,
  };
}

/** Unix expiry for a public item: one of the offered choices, otherwise the 12 hour maximum. */
export function publicExpiry(raw: string | null | undefined, now = Math.floor(Date.now() / 1000)) {
  return now + (raw && raw in PUBLIC_EXPIRY ? PUBLIC_EXPIRY[raw] : PUBLIC_MAX_SECONDS);
}

/**
 * Without a token, drop takes only what a browser can show passively: images, video, audio, PDF, plain text.
 * Icons are left out: they can wrap a PNG, but the sensitive content check only runs on the image types it reads.
 */
const PUBLIC_EXCLUDED = new Set(["image/x-icon"]);
export const publicTypeAllowed = (mime: string) => {
  const type = mime.toLowerCase().split(";")[0].trim();
  return INLINE_TYPES.has(type) && !PUBLIC_EXCLUDED.has(type);
};

/** UTC day number, the window of the daily cap. */
export const utcDay = (now = Date.now()) => Math.floor(now / 86400000);

/**
 * Key for the daily counter. The IP address is hashed together with a server secret and the day, so the
 * stored value can't be turned back into an address or linked across days. Rows are deleted after two days.
 */
export const usageKey = (ip: string, day: number, secret: string) => sha256Hex(`drop-public-usage:${day}:${ip}:${secret}`);

/** Is one more upload of `bytes` within today's cap, given what this address has used so far? */
export function withinDailyCap(used: { uploads: number; bytes: number } | null | undefined, bytes: number, lim: PublicLimits) {
  const u = used ?? { uploads: 0, bytes: 0 };
  return u.uploads + 1 <= lim.dailyUploads && u.bytes + bytes <= lim.dailyBytes;
}

/**
 * The address limits count against. IPv4 as is; IPv6 by its /64 prefix, because one connection usually
 * gets a whole /64 and could otherwise rotate through addresses to dodge the limits.
 */
export function limitKey(ip: string) {
  if (!ip.includes(":")) return ip;
  const a = ip.toLowerCase().split("%")[0];
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(a)) return a.slice(7);
  const [head, tail = ""] = a.split("::");
  const h = head ? head.split(":") : [], t = a.includes("::") && tail ? tail.split(":") : [];
  const groups = a.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return a;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
