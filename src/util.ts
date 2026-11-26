/** Pure helpers (no bindings), unit-tested in test/util.test.ts. */
export const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const THUMB_TYPES = /^image\/(jpeg|png|gif|webp|avif|bmp|tiff)$/;
export const EXPIRY: Record<string, number> = { "10m": 600, "1h": 3600, "1d": 86400, "7d": 604800, "30d": 2592000, "90d": 7776000, "1y": 31536000 };

export function randomString(len: number, alphabet = ID_ALPHABET) {
  const mask = (1 << Math.ceil(Math.log2(alphabet.length))) - 1;
  let out = "";
  // Rejection sampling: mask each byte down to the next power of two and drop values
  // outside the alphabet, so every character is equally likely (no modulo bias).
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      const v = b & mask;
      if (v < alphabet.length) out += alphabet[v];
      if (out.length === len) break;
    }
  }
  return out;
}

export function timingSafeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Prefix of named API tokens (issued from an admin hub and stored hashed in D1). */
export const TOKEN_PREFIX = "drop_";

/** The token a request carries: `Authorization: Bearer <token>`, `X-API-Key` or `?token=`. */
export function requestToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : req.headers.get("x-api-key") || new URL(req.url).searchParams.get("token") || "";
}

/** True when the request carries the master token (the API_TOKEN secret). */
export function isAuthed(req: Request, apiToken: string | undefined) {
  if (!apiToken) return false;
  const token = requestToken(req);
  return token.length > 0 && timingSafeEqual(token, apiToken);
}

/** Looks like a named token? Cheap check before touching D1. */
export function isNamedToken(token: string) {
  return token.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_]{20,100}$/.test(token);
}

export async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A named token row is usable when it is neither revoked nor past its expiry (unix seconds). */
export function tokenUsable(row: { expires_at: number | null; revoked_at: number | null } | null | undefined, now = Math.floor(Date.now() / 1000)) {
  return !!row && row.revoked_at == null && (row.expires_at == null || row.expires_at > now);
}

export function parseExpiry(v: string | null | undefined): number | null | undefined {
  if (!v || v === "never" || v === "0") return null;
  if (v in EXPIRY) return Math.floor(Date.now() / 1000) + EXPIRY[v];
  const m = /^(\d+)([mhdw])$/.exec(v);
  if (m) return Math.floor(Date.now() / 1000) + Number(m[1]) * { m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as "m"];
  return undefined; // invalid
}

export function extOf(name: string | null) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

export function sanitizeName(name: string) {
  return name.replace(/[\u0000-\u001f\/\\"]/g, "_").slice(0, 200) || "file";
}

/** Search and AI answer engines are welcome; training AI models on drop's pages is not. */
const AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Google-Extended", "Applebot-Extended", "Bytespider", "Amazonbot", "meta-externalagent", "cohere-ai", "MistralAI-Training", "Diffbot"];
export const robotsTxt = (origin: string) =>
  [
    "# Search engines and AI answer engines are welcome. Training AI models on this site is not allowed.",
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /d/",
    "Disallow: /request/",
    "",
    ...AI_TRAINING_BOTS.map((b) => `User-agent: ${b}`),
    "Disallow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

/** Who a request acts as: the master token (API_TOKEN) or one named token. */
export type Principal = { token: string; owner: string; master: boolean };
export const MASTER_OWNER = "master";

/**
 * SQL condition that limits items to what this principal may see in its history.
 * A named token sees only its own uploads; the master token sees its own and those from before owners
 * were recorded. Direct links (/v, /r, /s) stay public either way.
 */
export function ownerFilter(p: Pick<Principal, "owner" | "master">): { sql: string; args: string[] } {
  return p.master ? { sql: "(owner = ? OR owner IS NULL)", args: [p.owner] } : { sql: "owner = ?", args: [p.owner] };
}

/** May this principal manage (view details, delete, re-scan, release) the item? The master token may manage all. */
export const canManage = (p: Pick<Principal, "owner" | "master">, itemOwner: string | null | undefined) => p.master || (!!itemOwner && itemOwner === p.owner);
