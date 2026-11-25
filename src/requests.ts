/**
 * Token requests: a visitor asks for an API token, an admin approves or rejects it in an admin hub
 * (for example field, which writes to the token_requests table), and the visitor collects the token
 * once through a private claim link. The token is generated only when it is collected, so it is never
 * stored in plain text, never sent by email and never part of a URL.
 */
import { sha256Hex, TOKEN_PREFIX } from "./util";

/** An approved request can be collected for this long after the decision. */
export const CLAIM_WINDOW = 14 * 86400;
/** Decided and collected requests are deleted this long after they were made. */
export const KEEP_REQUESTS = 30 * 86400;
/** At most this many requests wait for review at once; more are refused until some are decided. */
export const MAX_PENDING = 50;

export type RequestRow = {
  id: string;
  name: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "claimed";
  label: string | null;
  token_expires_at: number | null;
  created_at: number;
  decided_at: number | null;
};

export type RequestState = "pending" | "approved" | "rejected" | "claimed" | "lapsed";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Unbiased random string (rejection sampling), for secrets. */
export function secretString(length: number, alphabet = ALPHABET) {
  const max = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) if (b < max && out.length < length) out += alphabet[b % alphabet.length];
  }
  return out;
}

/** Same shape as tokens issued from field: drop_ + 40 characters, a 16-hex id and a 12-character prefix. */
export async function newApiToken() {
  const secret = TOKEN_PREFIX + secretString(40);
  return { secret, id: secretString(16, "0123456789abcdef"), prefix: secret.slice(0, 12), hash: await sha256Hex(secret) };
}

/** Claim codes are long enough to be unguessable and short enough to read out. */
export const newClaimCode = () => secretString(32);
export const isClaimCode = (s: string) => /^[A-Za-z0-9]{32}$/.test(s);

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Reads the request form. Errors are meant for the person filling it in. */
export function readRequestForm(form: FormData): { name: string; reason: string } | { error: string } {
  const name = clean(form.get("name"));
  const reason = clean(form.get("reason"));
  if (clean(form.get("website"))) return { error: "Something went wrong. Reload the page and try again." }; // honeypot
  if (name.length < 2) return { error: "Tell us who you are, so we know who's asking." };
  if (name.length > 80) return { error: "Keep your name under 80 characters." };
  if (reason.length < 10) return { error: "Tell us in a sentence what you want to upload." };
  if (reason.length > 600) return { error: "Keep it under 600 characters." };
  return { name, reason };
}

/** Where a request stands, as the person who made it sees it. */
export function requestState(row: Pick<RequestRow, "status" | "decided_at">, now = Math.floor(Date.now() / 1000)): RequestState {
  if (row.status === "approved" && row.decided_at != null && now - row.decided_at > CLAIM_WINDOW) return "lapsed";
  return row.status;
}

/** Cloudflare Turnstile server-side check, for one widget action (and, when given, the hostname it ran on). */
export async function verifyTurnstile(secret: string, token: string, ip: string | null, fetcher: typeof fetch = fetch, action = "token-request", hostname?: string) {
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const out = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
    // a token solved for another action or on another site doesn't count here
    return out.success === true && (!out.action || out.action === action) && (!hostname || !out.hostname || out.hostname === hostname);
  } catch {
    return false;
  }
}
