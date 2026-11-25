/**
 * Named API tokens from the command line, for instances without an admin hub:
 *   node dist/node/server.js token create <label> [--days 90]
 *   node dist/node/server.js token list
 *   node dist/node/server.js token revoke <id>
 */
import { newApiToken } from "../requests";
import type { SqliteD1 } from "./bindings";

export async function tokenCommand(db: SqliteD1, args: string[], out = console.log): Promise<number> {
  const [cmd, ...rest] = args;
  const now = Math.floor(Date.now() / 1000);
  if (cmd === "create" && rest[0] && !rest[0].startsWith("--")) {
    const label = rest[0].slice(0, 80);
    const i = rest.indexOf("--days");
    const days = i >= 0 ? Number(rest[i + 1]) : 90;
    if (!Number.isFinite(days) || days < 0) { out("--days takes a number of days (0 = never expires)"); return 1; }
    const expires = days > 0 ? now + Math.round(days * 86400) : null;
    const t = await newApiToken();
    await db.prepare("INSERT INTO api_tokens (id, label, prefix, hash, created_at, created_by, expires_at) VALUES (?, ?, ?, ?, ?, 'cli', ?)")
      .bind(t.id, label, t.prefix, t.hash, now, expires).run();
    out(`token ${t.id} "${label}" ${expires ? `expires ${new Date(expires * 1000).toISOString().slice(0, 10)}` : "never expires"}`);
    out(t.secret);
    out("It is shown only this once.");
    return 0;
  }
  if (cmd === "list") {
    const { results } = await db.prepare("SELECT id, label, prefix, created_at, expires_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at DESC").all<Record<string, number | string | null>>();
    const day = (v: unknown) => (v ? new Date(Number(v) * 1000).toISOString().slice(0, 10) : "-");
    for (const r of results) out([r.id, r.prefix, JSON.stringify(r.label), `expires ${day(r.expires_at)}`, `used ${day(r.last_used_at)}`, r.revoked_at ? "revoked" : ""].join("  ").trim());
    if (!results.length) out("no named tokens yet");
    return 0;
  }
  if (cmd === "revoke" && rest[0]) {
    const r = await db.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, rest[0]).run();
    out(r.meta.changes ? `revoked ${rest[0]}` : `no active token with id ${rest[0]}`);
    return r.meta.changes ? 0 : 1;
  }
  out("usage: token create <label> [--days 90] | token list | token revoke <id>");
  return 1;
}
