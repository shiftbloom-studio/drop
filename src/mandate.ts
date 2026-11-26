// Mandates from stem: rights a person signed with their passkey for an agent, narrowed for sub-agents.
// drop maps each request to an action ("upload", "list", "delete"), the file name it touches and its
// size, and asks stem whether the chain allows it. stem checks the signatures, the narrowing, the stop
// button, the shared budget and replays, and keeps the trail. See stem's docs/mandates.md.
//
//   Authorization: Mandate <root>~<child>~...
//   Mandate-PoP: <proof of possession for this request>
//
// Items an agent uploads belong to its root mandate: every agent and sub-agent of one mandate sees the
// same history, and nothing else. Named tokens and the master token keep working as before.
import type { Principal } from "./util";

export type MandateAction = "upload" | "list" | "delete";
export type MandateCall = { action: MandateAction; path?: string; bytes?: number };
export type MandateDecision =
  | { allowed: true; mandate: string; sub: string; purpose: string; depth: number; remaining?: { bytes?: number; calls?: number } }
  | { allowed: false; reason: string; message: string };

/** stem's MandateGateway entrypoint, bound as MANDATES (same Cloudflare account). */
export interface MandateGateway {
  authorize(input: { chain: string[]; pop: string; method: string; url: string; action: string; path?: string; bytes?: number }): Promise<MandateDecision>;
}
export type MandateEnv = {
  MANDATES?: MandateGateway;
  /** stem's origin, for drop instances that can't bind stem (Node.js, other accounts): checks go over HTTP. */
  MANDATE_ISSUER?: string;
};

export const OWNER_PREFIX = "mandate:";

/** The chain from "Authorization: Mandate a~b~c", or null when the header is something else. */
export function parseMandate(header: string | null): string[] | null {
  const m = /^Mandate\s+(\S+)$/i.exec((header || "").trim());
  if (!m) return null;
  const chain = m[1].split("~").filter(Boolean);
  return chain.length && chain.length <= 8 && chain.every((t) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) ? chain : null;
}

/** The root mandate's id (jti). Read without checking: stem's answer has to name the same id. */
function rootId(chain: string[]): string | null {
  try {
    const p = JSON.parse(atob(chain[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { jti?: unknown };
    return typeof p.jti === "string" && /^[\w-]{8,64}$/.test(p.jti) ? p.jti : null;
  } catch {
    return null;
  }
}

export const mandatesEnabled = (env: MandateEnv) => !!(env.MANDATES || env.MANDATE_ISSUER);

async function ask(env: MandateEnv, input: Parameters<MandateGateway["authorize"]>[0]): Promise<MandateDecision> {
  if (env.MANDATES) return env.MANDATES.authorize(input);
  const res = await fetch(`${new URL(env.MANDATE_ISSUER!).origin}/api/mandates/authorize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const body = (await res.json().catch(() => null)) as MandateDecision | null;
  return body && typeof body.allowed === "boolean" ? body : { allowed: false, reason: "unavailable", message: "stem didn't answer" };
}

const refuse = (status: number, message: string, reason?: string) =>
  new Response(JSON.stringify({ error: message, ...(reason ? { reason } : {}) }, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });

/**
 * The principal for a request with a mandate, a refusal, or null when the request has no mandate.
 * The principal's check() must run once before the request touches anything: it is what asks stem.
 */
export function mandatePrincipal(req: Request, env: MandateEnv): Principal | Response | null {
  const header = req.headers.get("authorization");
  if (!/^Mandate\s/i.test(header || "")) return null;
  if (!mandatesEnabled(env)) return refuse(401, "this drop doesn't take mandates; use a token");
  const chain = parseMandate(header);
  const pop = req.headers.get("mandate-pop") || "";
  const id = chain && rootId(chain);
  if (!chain || !id || !pop) return refuse(401, "send Authorization: Mandate <chain> and Mandate-PoP: <proof>");
  let done = false;
  return {
    token: "",
    owner: OWNER_PREFIX + id,
    master: false,
    mandate: true,
    async check(call: MandateCall) {
      if (done) return refuse(500, "mandate checked twice");
      done = true;
      const d = await ask(env, { chain, pop, method: req.method, url: req.url, action: call.action, path: call.path, bytes: call.bytes }).catch(
        (e): MandateDecision => {
          console.error("[drop] mandate check failed", e);
          return { allowed: false, reason: "unavailable", message: "stem didn't answer; try again" };
        },
      );
      if (!d.allowed) return refuse(d.reason === "unavailable" ? 503 : 403, d.message, d.reason);
      if (d.mandate !== id) return refuse(403, "mandate mismatch");
      return null;
    },
  };
}
