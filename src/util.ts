/** Pure helpers (no bindings), unit-tested in test/util.test.ts. */
export const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const THUMB_TYPES = /^image\/(jpeg|png|gif|webp|avif|bmp|tiff)$/;
export const EXPIRY: Record<string, number> = { "10m": 600, "1h": 3600, "1d": 86400, "7d": 604800, "30d": 2592000, "90d": 7776000, "1y": 31536000 };

export function randomString(len: number, alphabet = ID_ALPHABET) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function timingSafeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Accepts `Authorization: Bearer <token>`, `X-API-Key` or `?token=`. */
export function isAuthed(req: Request, apiToken: string | undefined) {
  if (!apiToken) return false;
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : req.headers.get("x-api-key") || new URL(req.url).searchParams.get("token") || "";
  return token.length > 0 && timingSafeEqual(token, apiToken);
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

